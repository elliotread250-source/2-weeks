// Shooting, pickaxe swings, rockets, healing, reloading and damage. Shared by
// humans and bots so everyone plays by the same rules. Sound, particles and HUD
// feedback leave as events (see Match.emit); nothing here touches the renderer.
import { WEAPONS, PICKAXE, CONSUMABLES, PLAYER, FALLOFF, MAX_MATS } from '../config.js';
import { rayBox } from './collision.js';
import { Vec3 } from '../math/vec3.js';
import { GAME } from '../names.js';

const MAT_SPARK = { wood: '#a0703f', brick: '#b0533a', metal: '#9aa5b1' };
const STATIC_SPARK = { wood: '#a0703f', brick: '#b9b0a2', metal: '#b0bec5' };

export class Combat {
  constructor(match) {
    this.m = match;
    this.rockets = [];
    this.nextRocketId = 1;
  }

  get col() { return this.m.collision; }
  get rng() { return this.m.rng; }

  // Random direction inside a cone around dir.
  spreadDir(dir, spread) {
    if (spread <= 0) return dir.clone();
    const up = Math.abs(dir.y) < 0.95 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0);
    const right = new Vec3().crossVectors(dir, up).normalize();
    const up2 = new Vec3().crossVectors(right, dir).normalize();
    const r = Math.sqrt(this.rng.random()) * spread;
    const a = this.rng.random() * Math.PI * 2;
    return dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
  }

  muzzlePos(f) {
    const right = new Vec3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    const fwd = new Vec3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
    return f.pos.clone().add(new Vec3(0, 1.45, 0)).addScaledVector(right, 0.38).addScaledVector(fwd, 0.7);
  }

  sfx(name, pos, by) {
    this.m.emit('sfx', { name, pos: { x: pos.x, y: pos.y, z: pos.z }, by });
  }

  // Raycast the world and every fighter except `self`.
  trace(origin, dir, range, self) {
    const world = this.col.raycast(origin, dir, range);
    let bestT = world ? world.t : range;
    let hitFighter = null, head = false;
    for (const f of this.m.fighters) {
      if (f === self || !f.alive || f.state === 'bus') continue;
      const hb = f.hitboxes();
      const hh = hb.head ? rayBox(origin, dir, hb.head, bestT) : null;
      if (hh && hh.t < bestT) { bestT = hh.t; hitFighter = f; head = true; }
      const hbody = rayBox(origin, dir, hb.body, bestT);
      if (hbody && hbody.t < bestT) { bestT = hbody.t; hitFighter = f; head = false; }
    }
    const point = origin.clone().addScaledVector(dir, bestT);
    if (hitFighter) return { fighter: hitFighter, head, t: bestT, point };
    if (world) return { world, t: bestT, point, normal: world.normal };
    return { t: range, point };
  }

  tryReload(f) {
    const w = f.weapon;
    if (!w || f.reloadT > 0) return false;
    const spec = WEAPONS[w.type];
    if (w.mag >= spec.mag || f.ammo[spec.ammo] <= 0) return false;
    f.reloadT = spec.reload[w.rarity];
    f.heal = null;
    this.sfx('reload', f.pos, f.id);
    return true;
  }

  update(dt) {
    for (const f of this.m.fighters) {
      if (!f.alive) continue;
      f.fireCd = Math.max(0, f.fireCd - dt);
      f.swingT = Math.max(0, f.swingT - dt);
      if (f.pendingSwing) {
        f.pendingSwing.t -= dt;
        if (f.pendingSwing.t <= 0) this.resolveSwing(f);
      }
      f.bloom = Math.max(0, f.bloom - dt * 0.12);
      if (f.reloadT > 0) {
        f.reloadT -= dt;
        if (f.reloadT <= 0) {
          f.reloadT = 0;
          const w = f.weapon;
          if (w) {
            const spec = WEAPONS[w.type];
            const n = Math.min(spec.mag - w.mag, f.ammo[spec.ammo]);
            w.mag += n;
            f.ammo[spec.ammo] -= n;
          }
        }
      }
      if (f.heal) {
        f.heal.t -= dt;
        if (f.heal.t <= 0) this.finishHeal(f);
      }
    }
    this.updateRockets(dt);
  }

  // ---------------------------------------------------------------- guns

  fire(f, origin, dir, opts = {}) {
    const w = f.weapon;
    if (!w || f.fireCd > 0 || f.reloadT > 0) return false;
    const spec = WEAPONS[w.type];
    if (w.mag <= 0) {
      if (!this.tryReload(f)) { this.sfx('empty', f.pos, f.id); f.fireCd = 0.3; }
      return false;
    }
    f.heal = null;
    w.mag -= 1;
    f.fireCd = 1 / spec.fireRate;
    const moving = Math.hypot(f.vel.x, f.vel.z) > 1;
    let spread = opts.ads ? spec.adsSpread : spec.spread;
    if (spec.pellets === 1) {
      if (moving) spread += 0.015;
      if (!f.onGround) spread += 0.035;
      spread += f.bloom;
      f.bloom = Math.min(0.05, f.bloom + spec.bloom);
    }
    if (opts.firstShotAccurate && f.bloom <= spec.bloom && !moving && opts.ads) spread *= 0.2;

    const muzzle = this.muzzlePos(f);
    this.m.emit('muzzle', { pos: muzzle });
    this.sfx(w.type, f.pos, f.id);
    this.m.emit('kick', { by: f.id, k: w.type === 'sniper' || w.type === 'pump' ? 1 : 0.4 });

    if (spec.projectile) {
      this.spawnRocket(f, muzzle, this.spreadDir(dir, spread), spec, w);
      return true;
    }

    const dmgTotal = spec.damage[w.rarity];
    const per = dmgTotal / spec.pellets;
    const dealt = new Map();
    for (let i = 0; i < spec.pellets; i++) {
      const d = this.spreadDir(dir, spread);
      const hit = this.trace(origin, d, spec.range, f);
      if (i < 3 || spec.pellets === 1) this.m.emit('tracer', { from: muzzle, to: hit.point });
      if (hit.fighter) {
        const dmg = per * (hit.head ? spec.headMult : 1) * falloff(w.type, hit.t);
        const prev = dealt.get(hit.fighter) || { dmg: 0, head: false, point: hit.point };
        prev.dmg += dmg;
        prev.head = prev.head || hit.head;
        dealt.set(hit.fighter, prev);
      } else if (hit.world) {
        this.hitWorld(hit, per * spec.structureMult, f);
      }
    }
    for (const [target, info] of dealt) {
      this.applyDamage(target, info.dmg, f, { head: info.head, weapon: spec.name, point: info.point });
    }
    return true;
  }

  hitWorld(hit, dmg) {
    const c = hit.world.collider;
    const burst = (color, n, speed, size) => this.m.emit('burst', { pos: hit.point, color, n, speed, size });
    if (c && c.kind === 'build') {
      burst(MAT_SPARK[c.owner.mat], 3, 3);
      this.m.builds.damage(c.owner, dmg);
    } else if (c && c.kind === 'static' && c.owner) {
      burst(STATIC_SPARK[c.owner.mat], 3, 2.5, 0.7);
      this.m.world.damageStatic(c.owner, dmg, this.rng);
    } else if (c && c.kind === 'harvest') {
      burst('#7a5a3a', 3, 3);
    } else {
      burst(hit.world.terrain ? '#6b8f3a' : '#9e9e9e', 3, 2.5, 0.6);
    }
  }

  // ---------------------------------------------------------------- rockets

  spawnRocket(f, pos, dir, spec, w) {
    this.rockets.push({
      id: this.nextRocketId++, owner: f, pos: pos.clone(), dir: dir.clone(), speed: spec.projectile.speed, life: 6,
      damage: spec.damage[w.rarity], splash: spec.projectile.splash, structure: spec.projectile.structureDamage, name: spec.name,
    });
  }

  updateRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      const step = r.speed * dt;
      const hit = this.trace(r.pos, r.dir, step, r.owner);
      if (hit.fighter || hit.world || r.life <= 0) {
        this.explode(hit.point, r);
        this.rockets.splice(i, 1);
        continue;
      }
      r.pos.addScaledVector(r.dir, step);
      if (this.rng.random() < 0.6) this.m.emit('burst', { pos: r.pos, color: '#cccccc', n: 1, speed: 0.6, size: 0.8 });
    }
  }

  explode(p, r) {
    this.m.emit('explosion', { pos: { x: p.x, y: p.y, z: p.z }, radius: r.splash });
    // Builds inside the blast take heavy structure damage.
    const builds = this.m.builds;
    for (const piece of [...builds.list]) {
      const cx = piece.gx * 5 + 2.5, cz = piece.gz * 5 + 2.5;
      const d = Math.hypot(cx - p.x, piece.baseY + 1.8 - p.y, cz - p.z);
      if (d < r.splash + 2.5) builds.damage(piece, r.structure);
    }
    // The map breaks too.
    const R = r.splash;
    const hitEls = new Set();
    for (const c of this.col.query(p.x - R, p.z - R, p.x + R, p.z + R)) {
      if (c.kind !== 'static' || !c.owner || c.owner.dead) continue;
      const cx = Math.max(c.min.x, Math.min(p.x, c.max.x));
      const cy = Math.max(c.min.y, Math.min(p.y, c.max.y));
      const cz = Math.max(c.min.z, Math.min(p.z, c.max.z));
      if (Math.hypot(cx - p.x, cy - p.y, cz - p.z) < R) hitEls.add(c.owner);
    }
    for (const el of hitEls) this.m.world.damageStatic(el, r.structure, this.rng);
    for (const f of this.m.fighters) {
      if (!f.alive || f.state === 'bus') continue;
      const c = f.pos.clone().add(new Vec3(0, 1, 0));
      const d = c.distanceTo(p);
      if (d > r.splash) continue;
      if (!this.col.lineOfSight(new Vec3(p.x, p.y + 0.3, p.z), c)) continue;
      const dmg = r.damage * (1 - (d / r.splash) * 0.6);
      this.applyDamage(f, dmg, r.owner, { weapon: r.name, point: c });
    }
  }

  // ---------------------------------------------------------------- pickaxe

  // Start a swing. The hit lands when the pickaxe comes down, not on click.
  swing(f, origin, dir) {
    if (f.fireCd > 0 || f.pendingSwing) return null;
    f.fireCd = PICKAXE.cooldown;
    f.swingT = 0.42;
    f.heal = null;
    f.pendingSwing = { t: 0.17, origin: origin.clone(), dir: dir.clone() };
    this.sfx('swing', f.pos, f.id);
    return true;
  }

  resolveSwing(f) {
    // Humans aim with the camera as it is when the blade lands; bots committed
    // to a direction when they started.
    const { origin, dir } = f.human ? f.aimRay() : f.pendingSwing;
    f.pendingSwing = null;
    const hit = this.trace(origin, dir, PICKAXE.range, f);
    const burst = (color, n, speed, size) => this.m.emit('burst', { pos: hit.point, color, n, speed, size });
    if (hit.fighter) {
      this.applyDamage(hit.fighter, PICKAXE.playerDamage, f, { weapon: PICKAXE.name, point: hit.point });
      this.sfx('pickaxe', f.pos, f.id);
      this.m.emit('kick', { by: f.id, k: 0.6 });
      return hit;
    }
    if (!hit.world) return null;
    const c = hit.world.collider;
    this.sfx('pickaxe', f.pos, f.id);
    this.m.emit('kick', { by: f.id, k: 0.5 });
    if (c && c.kind === 'build') {
      burst('#c8a165', 4, 3);
      this.structNumber(f, hit.point, PICKAXE.structureDamage);
      this.m.builds.damage(c.owner, PICKAXE.structureDamage);
    } else if (c && c.kind === 'static' && c.owner) {
      // Any piece of the map: walls, floors, roofs, stairs, towers...
      const el = c.owner;
      const gained = 6;
      f.mats[el.mat] = Math.min(MAX_MATS, f.mats[el.mat] + gained);
      burst(STATIC_SPARK[el.mat], 5, 3);
      this.structNumber(f, hit.point, PICKAXE.structureDamage);
      this.m.world.damageStatic(el, PICKAXE.structureDamage, this.rng);
      this.m.emit('matGain', { by: f.id, mat: el.mat, n: gained });
    } else if (c && c.kind === 'harvest') {
      const h = this.m.world.harvestables.find((x) => x.collider === c);
      if (h) {
        const crit = !!(h.weak && Math.hypot(h.weak.pos.x - hit.point.x, h.weak.pos.y - hit.point.y, h.weak.pos.z - hit.point.z) < 0.5);
        const gained = this.m.world.hitHarvestable(h, hit.point, hit.normal, crit, this.rng);
        f.mats[h.mat] = Math.min(MAX_MATS, f.mats[h.mat] + gained);
        burst(h.mat === 'wood' ? '#a0703f' : h.mat === 'brick' ? '#9e9e9e' : '#b0bec5', crit ? 8 : 4, 3);
        this.structNumber(f, hit.point, crit ? 100 : 50, crit);
        if (crit) this.m.emit('sfx', { name: 'crit', by: f.id, own: true });
        this.m.emit('matGain', { by: f.id, mat: h.mat, n: gained });
      }
    } else {
      burst('#9e9e9e', 2, 2, 0.6);
    }
    return hit;
  }

  structNumber(f, point, dmg, crit = false) {
    this.m.emit('damageNumber', { by: f.id, pos: { x: point.x, y: point.y, z: point.z }, amount: dmg, kind: crit ? 'head' : 'struct' });
  }

  // ---------------------------------------------------------------- healing

  canUse(f, type) {
    const s = CONSUMABLES[type];
    if (s.health && f.hp < s.healthCap) return true;
    if (s.shield && f.shield < s.shieldCap) return true;
    return false;
  }

  startHeal(f) {
    const it = f.item;
    if (!it || it.kind !== 'consumable' || f.heal) return false;
    if (!this.canUse(f, it.type)) return false;
    f.heal = { slot: f.selected, type: it.type, t: CONSUMABLES[it.type].time, total: CONSUMABLES[it.type].time };
    f.reloadT = 0;
    this.sfx('heal', f.pos, f.id);
    return true;
  }

  finishHeal(f) {
    const h = f.heal;
    f.heal = null;
    const it = f.slots[h.slot - 1];
    if (!it || it.kind !== 'consumable' || it.type !== h.type) return;
    const s = CONSUMABLES[h.type];
    if (s.health) f.hp = Math.max(f.hp, Math.min(s.healthCap, f.hp + s.health));
    if (s.shield) f.shield = Math.max(f.shield, Math.min(s.shieldCap, f.shield + s.shield));
    f.hp = Math.min(PLAYER.maxHealth, f.hp);
    f.shield = Math.min(PLAYER.maxShield, f.shield);
    it.count -= 1;
    if (it.count <= 0) f.slots[h.slot - 1] = null;
    this.sfx('heal', f.pos, f.id);
  }

  // ---------------------------------------------------------------- damage

  // Shield soaks damage first; the storm ignores it.
  applyDamage(target, amount, source, opts = {}) {
    if (!target.alive || amount <= 0) return;
    if (this.m.phase === 'over') return;
    let toShield = 0, toHealth = 0;
    if (opts.storm) {
      toHealth = amount;
    } else {
      toShield = Math.min(target.shield, amount);
      toHealth = amount - toShield;
    }
    const hadShield = target.shield > 0;
    target.shield -= toShield;
    target.hp -= toHealth;
    target.flash = 0.15;
    if (source && source !== target) target.lastHitBy = { f: source, t: this.m.time };

    const pt = opts.point || target.pos.clone().add(new Vec3(0, 1.8, 0));
    this.m.emit('hit', {
      by: source && source !== target ? source.id : null, target: target.id, amount,
      kind: opts.head ? 'head' : toShield > 0 && toHealth === 0 ? 'shield' : 'health',
      head: !!opts.head, shieldBroke: hadShield && target.shield <= 0, storm: !!opts.storm,
      pos: { x: pt.x, y: pt.y, z: pt.z },
      from: source ? { x: source.pos.x, y: source.pos.y, z: source.pos.z } : null,
    });
    if (target.brain) target.brain.onDamaged(source);

    if (target.hp <= 0) {
      target.hp = 0;
      this.m.eliminate(target, source, opts.storm ? GAME.storm : opts.weapon);
    }
  }
}

function falloff(type, dist) {
  const f = FALLOFF[type];
  if (!f) return 1;
  return dist < f.start ? 1 : Math.max(f.min, 1 - (dist - f.start) / f.span);
}
