// Shooting, pickaxe swings, rockets, healing, reloading and damage. Shared by
// the player and the bots so everyone plays by the same rules.
import * as THREE from 'three';
import { WEAPONS, PICKAXE, CONSUMABLES, PLAYER } from './config.js';
import { rayBox } from './collision.js';
import { sfx } from './audio.js';

const tmpDir = new THREE.Vector3();

function spreadDir(dir, spread) {
  if (spread <= 0) return dir.clone();
  // Random direction inside a cone around dir.
  const up = Math.abs(dir.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize();
  const up2 = new THREE.Vector3().crossVectors(right, dir).normalize();
  const r = Math.sqrt(Math.random()) * spread;
  const a = Math.random() * Math.PI * 2;
  return dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
}

export class Combat {
  constructor(game) {
    this.game = game;
    this.rockets = [];
  }

  get col() { return this.game.collision; }

  muzzlePos(f) {
    const right = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    const fwd = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw));
    return f.pos.clone().add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(right, 0.38).addScaledVector(fwd, 0.7);
  }

  volumeFor(f) {
    if (f.isPlayer) return 1;
    const p = this.game.player;
    const d = f.pos.distanceTo(p.pos);
    return Math.max(0, 1 - d / 160) * 0.8;
  }

  // Raycast the world and every fighter except `self`.
  trace(origin, dir, range, self) {
    const world = this.col.raycast(origin, dir, range);
    let bestT = world ? world.t : range;
    let hitFighter = null, head = false;
    for (const f of this.game.fighters) {
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
    sfx('reload', this.volumeFor(f));
    return true;
  }

  update(dt) {
    for (const f of this.game.fighters) {
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
      if (!this.tryReload(f)) { sfx('empty', this.volumeFor(f)); f.fireCd = 0.3; }
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
    this.game.fx.muzzle(muzzle);
    sfx(w.type, this.volumeFor(f));
    if (f.isPlayer) this.game.hud.kick(w.type === 'sniper' || w.type === 'pump' ? 1 : 0.4);

    if (spec.projectile) {
      this.spawnRocket(f, muzzle, spreadDir(dir, spread), spec, w);
      return true;
    }

    const dmgTotal = spec.damage[w.rarity];
    const per = dmgTotal / spec.pellets;
    let anyHit = false, anyHead = false;
    const dealt = new Map();
    for (let i = 0; i < spec.pellets; i++) {
      const d = spreadDir(dir, spread);
      const hit = this.trace(origin, d, spec.range, f);
      if (i < 3 || spec.pellets === 1) this.game.fx.tracer(muzzle, hit.point);
      if (hit.fighter) {
        let dmg = per * (hit.head ? spec.headMult : 1);
        // Shotgun and SMG falloff.
        if (w.type === 'pump') dmg *= hit.t < 7 ? 1 : Math.max(0.25, 1 - (hit.t - 7) / 25);
        if (w.type === 'smg' || w.type === 'pistol') dmg *= hit.t < 25 ? 1 : Math.max(0.6, 1 - (hit.t - 25) / 80);
        const prev = dealt.get(hit.fighter) || { dmg: 0, head: false, point: hit.point };
        prev.dmg += dmg;
        prev.head = prev.head || hit.head;
        dealt.set(hit.fighter, prev);
        anyHit = true;
        anyHead = anyHead || hit.head;
      } else if (hit.world) {
        this.hitWorld(hit, per * spec.structureMult, f);
      }
    }
    for (const [target, info] of dealt) {
      this.applyDamage(target, info.dmg, f, { head: info.head, weapon: spec.name, point: info.point });
    }
    return true;
  }

  hitWorld(hit, dmg, f) {
    const c = hit.world.collider;
    const fx = this.game.fx;
    if (c && c.kind === 'build') {
      fx.burst(hit.point, c.owner.mat === 'wood' ? '#a0703f' : c.owner.mat === 'brick' ? '#b0533a' : '#9aa5b1', 3, 3);
      this.game.builds.damage(c.owner, dmg);
    } else if (c && c.kind === 'static' && c.owner) {
      fx.burst(hit.point, c.owner.mat === 'wood' ? '#a0703f' : c.owner.mat === 'brick' ? '#b9b0a2' : '#b0bec5', 3, 2.5, 0.7);
      this.game.world.damageStatic(c.owner, dmg);
    } else if (c && c.kind === 'harvest') {
      fx.burst(hit.point, '#7a5a3a', 3, 3);
    } else {
      fx.burst(hit.point, hit.world.terrain ? '#6b8f3a' : '#9e9e9e', 3, 2.5, 0.6);
    }
  }

  // ---------------------------------------------------------------- rockets

  spawnRocket(f, pos, dir, spec, w) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#556b2f', emissive: '#331100' }));
    m.position.copy(pos);
    m.lookAt(pos.clone().add(dir));
    this.game.scene.add(m);
    this.rockets.push({
      owner: f, pos: pos.clone(), dir: dir.clone(), speed: spec.projectile.speed, mesh: m, life: 6,
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
        this.game.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      r.pos.addScaledVector(r.dir, step);
      r.mesh.position.copy(r.pos);
      if (Math.random() < 0.6) this.game.fx.burst(r.pos, '#cccccc', 1, 0.6, 0.8);
    }
  }

  explode(p, r) {
    this.game.fx.explosion(p, r.splash);
    const pl = this.game.player;
    sfx('explosion', Math.max(0.1, 1 - p.distanceTo(pl.pos) / 200));
    // Builds inside the blast take heavy structure damage.
    const builds = this.game.builds;
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
    for (const el of hitEls) this.game.world.damageStatic(el, r.structure);
    for (const f of this.game.fighters) {
      if (!f.alive || f.state === 'bus') continue;
      const c = f.pos.clone().add(new THREE.Vector3(0, 1, 0));
      const d = c.distanceTo(p);
      if (d > r.splash) continue;
      if (!this.col.lineOfSight(p.clone().add(new THREE.Vector3(0, 0.3, 0)), c)) continue;
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
    sfx('swing', this.volumeFor(f));
    return true;
  }

  resolveSwing(f) {
    const { origin, dir } = f.isPlayer ? this.game.controller.aimRay() : f.pendingSwing;
    f.pendingSwing = null;
    const hit = this.trace(origin, dir, PICKAXE.range, f);
    if (hit.fighter) {
      this.applyDamage(hit.fighter, PICKAXE.playerDamage, f, { weapon: PICKAXE.name, point: hit.point });
      sfx('pickaxe', this.volumeFor(f));
      if (f.isPlayer) this.game.hud.kick(0.6);
      return hit;
    }
    if (!hit.world) return null;
    const c = hit.world.collider;
    sfx('pickaxe', this.volumeFor(f));
    if (f.isPlayer) this.game.hud.kick(0.5);
    if (c && c.kind === 'build') {
      this.game.fx.burst(hit.point, '#c8a165', 4, 3);
      this.structNumber(f, hit.point, PICKAXE.structureDamage);
      this.game.builds.damage(c.owner, PICKAXE.structureDamage);
    } else if (c && c.kind === 'static' && c.owner) {
      // Any piece of the map: walls, floors, roofs, stairs, towers...
      const el = c.owner;
      const gained = 6;
      f.mats[el.mat] = Math.min(999, f.mats[el.mat] + gained);
      this.game.fx.burst(hit.point, el.mat === 'wood' ? '#a0703f' : el.mat === 'brick' ? '#b9b0a2' : '#b0bec5', 5, 3);
      this.structNumber(f, hit.point, PICKAXE.structureDamage);
      this.game.world.damageStatic(el, PICKAXE.structureDamage);
      if (f.isPlayer) this.game.hud.matGain(el.mat, gained);
    } else if (c && c.kind === 'harvest') {
      const h = this.game.world.harvestables.find((x) => x.collider === c);
      if (h) {
        const crit = !!(h.weak && h.weak.pos.distanceTo(hit.point) < 0.5);
        const gained = this.game.world.hitHarvestable(h, hit.point, hit.normal, crit);
        f.mats[h.mat] = Math.min(999, f.mats[h.mat] + gained);
        this.game.fx.burst(hit.point, h.mat === 'wood' ? '#a0703f' : h.mat === 'brick' ? '#9e9e9e' : '#b0bec5', crit ? 8 : 4, 3);
        this.structNumber(f, hit.point, crit ? 100 : 50, crit);
        if (f.isPlayer) {
          if (crit) sfx('crit');
          this.game.hud.matGain(h.mat, gained);
          this.game.focusHarvest = h;
        }
      }
    } else {
      this.game.fx.burst(hit.point, '#9e9e9e', 2, 2, 0.6);
    }
    return hit;
  }

  structNumber(f, point, dmg, crit = false) {
    if (!f.isPlayer) return;
    this.game.fx.damageNumber(new THREE.Vector3(point.x, point.y, point.z), dmg, crit ? 'head' : 'struct');
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
    sfx('heal', this.volumeFor(f) * 0.6);
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
    sfx('heal', this.volumeFor(f));
  }

  // ---------------------------------------------------------------- damage

  applyDamage(target, amount, source, opts = {}) {
    if (!target.alive || amount <= 0) return;
    if (this.game.phase === 'over') return;
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
    if (source && source !== target) target.lastHitBy = { f: source, t: this.game.time };

    const game = this.game;
    if (source && source.isPlayer && source !== target) {
      const pt = opts.point || target.pos.clone().add(new THREE.Vector3(0, 1.8, 0));
      game.fx.damageNumber(pt, amount, opts.head ? 'head' : toShield > 0 && toHealth === 0 ? 'shield' : 'health');
      game.hud.hitMarker(opts.head);
      sfx(opts.head ? 'headshot' : 'hit');
      if (hadShield && target.shield <= 0) sfx('shieldBreak', 0.7);
    }
    if (target.isPlayer && !opts.storm) {
      game.hud.damageFlash(source ? source.pos : null);
      sfx('hurt', 0.6);
    }
    if (target.brain) target.brain.onDamaged(source);

    if (target.hp <= 0) {
      target.hp = 0;
      game.eliminate(target, source, opts.storm ? 'the Storm' : opts.weapon);
    }
  }
}
