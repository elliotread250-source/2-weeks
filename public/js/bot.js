// Bot brains. Bots drop from the bus, loot, farm, fight, build cover when
// they get shot, heal up and run from the storm.
import * as THREE from 'three';
import { PLAYER, WEAPONS, BUILD_COST, MAT_ORDER } from './config.js';
import { POIS, terrainHeight } from './terrain.js';
import { rand, pick, angleDiff, clamp } from './util.js';

const PREFERRED_RANGE = { pump: 5, smg: 12, pistol: 16, ar: 26, sniper: 70, rocket: 30 };

export class BotBrain {
  constructor(game, fighter, skill) {
    this.game = game;
    this.f = fighter;
    this.skill = skill; // 0..1
    fighter.brain = this;
    this.resetForDrop();
  }

  resetForDrop() {
    const poi = Math.random() < 0.85 ? pick(POIS) : null;
    this.dropTarget = poi
      ? new THREE.Vector2(poi.x + rand(-poi.pad, poi.pad) * 0.6, poi.z + rand(-poi.pad, poi.pad) * 0.6)
      : new THREE.Vector2(rand(-150, 150), rand(-140, 140));
    this.jumpDelay = rand(0, 1);
    this.think = rand(0, 0.3);
    this.goal = null;
    this.goalKind = '';
    this.target = null;
    this.targetSeenAt = -10;
    this.lastKnown = null;
    this.reactT = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.lastPosT = 0;
    this.detour = null;
    this.buildCd = 0;
    this.aimErr = new THREE.Vector2();
    this.attacker = null;
    this.harvestTarget = null;
  }

  onDamaged(source) {
    if (!source || source === this.f) return;
    this.attacker = source;
    this.attackedAt = this.game.time;
    if (!this.target || this.target === source) {
      this.target = source;
      this.lastKnown = source.pos.clone();
    }
    // Fortnite reflex: throw up a wall (and sometimes a ramp) when shot.
    if (this.buildCd <= 0 && this.f.state === 'ground' && Math.random() < 0.55 + this.skill * 0.3) {
      this.buildCover(source);
    }
  }

  matToUse() {
    for (const m of MAT_ORDER) if (this.f.mats[m] >= BUILD_COST) return m;
    return null;
  }

  buildCover(threat) {
    const f = this.f;
    const mat = this.matToUse();
    if (!mat) return;
    const yaw = Math.atan2(-(threat.pos.x - f.pos.x), -(threat.pos.z - f.pos.z));
    const builds = this.game.builds;
    const pieces = Math.random() < 0.4 ? ['wall', 'ramp'] : ['wall'];
    for (const type of pieces) {
      const m2 = this.matToUse();
      if (!m2) break;
      const t = builds.computeTarget(type, f.pos, yaw, 0);
      const p = builds.place(t, m2, f);
      if (p) f.mats[m2] -= BUILD_COST;
    }
    this.buildCd = rand(2.5, 5);
  }

  bestWeaponFor(dist) {
    const f = this.f;
    let best = -1, score = -Infinity;
    f.slots.forEach((s, i) => {
      if (!s || s.kind !== 'weapon') return;
      const spec = WEAPONS[s.type];
      if (s.mag <= 0 && f.ammo[spec.ammo] <= 0) return;
      const pr = PREFERRED_RANGE[s.type];
      const sc = spec.damage[s.rarity] * spec.fireRate * 0.2 + s.rarity * 4 - Math.abs(dist - pr) * 0.8;
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }

  hasGun() {
    return this.f.slots.some((s) => s && s.kind === 'weapon' && (s.mag > 0 || this.f.ammo[WEAPONS[s.type].ammo] > 0));
  }

  eye(f) {
    return f.pos.clone().add(new THREE.Vector3(0, 1.6, 0));
  }

  findTarget() {
    const f = this.f;
    let best = null, bd = 75 + this.skill * 30;
    for (const o of this.game.fighters) {
      if (o === f || !o.alive || o.state === 'bus') continue;
      const d = o.pos.distanceTo(f.pos);
      if (d > bd) continue;
      if (!this.game.collision.lineOfSight(this.eye(f), o.pos.clone().add(new THREE.Vector3(0, 1.3, 0)))) continue;
      bd = d;
      best = o;
    }
    return best;
  }

  update(dt) {
    const f = this.f;
    if (!f.alive) return;
    this.buildCd -= dt;
    if (f.state === 'bus') return;
    if (f.state === 'skydive' || f.state === 'glide') return this.updateDrop(dt);

    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.25;
      this.decide();
    }
    this.act(dt);
  }

  updateDrop() {
    const f = this.f;
    const dx = this.dropTarget.x - f.pos.x, dz = this.dropTarget.y - f.pos.z;
    const d = Math.hypot(dx, dz);
    const speed = f.state === 'skydive' ? PLAYER.skydiveSpeed : PLAYER.glideSpeed;
    const k = Math.min(1, d / 10);
    f.vel.x = (dx / (d || 1)) * speed * k;
    f.vel.z = (dz / (d || 1)) * speed * k;
    f.yaw = Math.atan2(-dx, -dz);
    this.dive = d < 40; // dive straight down once roughly overhead
  }

  decide() {
    const f = this.f;
    const g = this.game;
    const storm = g.storm;

    // Target acquisition.
    const seen = this.findTarget();
    if (seen) {
      if (seen !== this.target) this.reactT = 0.45 - this.skill * 0.25;
      this.target = seen;
      this.targetSeenAt = g.time;
      this.lastKnown = seen.pos.clone();
    } else if (this.target && (g.time - this.targetSeenAt > 4 || !this.target.alive)) {
      this.target = null;
    }

    // Storm rotation beats everything when outside the safe zone.
    const inStorm = storm.outside(f.pos);
    const needRotate = storm.mode !== 'idle' && (inStorm || (storm.outsideNext(f.pos, 8) && (storm.mode === 'shrink' || storm.timer < 25)));
    if (needRotate) {
      const c = storm.mode === 'shrink' || inStorm ? storm.next.c : storm.next.c;
      const ang = Math.atan2(f.pos.z - c.y, f.pos.x - c.x) + rand(-0.4, 0.4);
      const r = storm.next.r * 0.5;
      this.goal = new THREE.Vector3(c.x + Math.cos(ang) * r, 0, c.y + Math.sin(ang) * r);
      this.goalKind = 'storm';
      if (!this.target || inStorm) return;
    }

    if (this.target && this.hasGun()) {
      this.goalKind = 'fight';
      return;
    }

    // Heal when safe.
    if (f.hp + f.shield < 150) {
      const idx = f.slots.findIndex((s) => s && s.kind === 'consumable' && g.combat.canUse(f, s.type));
      if (idx >= 0 && !this.target) {
        this.goalKind = 'heal';
        if (f.selected !== idx + 1) f.select(idx + 1);
        return;
      }
    }

    // Farm a little first if we already have a gun but no mats to build with.
    const totalMats = f.mats.wood + f.mats.brick + f.mats.metal;
    if (this.hasGun() && totalMats < 60 && !this.target && this.pickHarvest(18)) {
      this.goal = new THREE.Vector3(this.harvestTarget.center.x, 0, this.harvestTarget.center.z);
      this.goalKind = 'harvest';
      return;
    }

    // Loot.
    const wantsLoot = !this.hasGun() || f.slots.filter((s) => s).length < 4;
    if (wantsLoot) {
      const pk = g.loot.nearestPickup(f.pos, 45, (p) => (p.item.kind === 'weapon' || p.item.kind === 'consumable') && f.hasRoomFor(p.item));
      const ch = g.loot.nearestChest(f.pos, 45);
      let tgt = null;
      if (pk && ch) tgt = pk.pos.distanceTo(f.pos) < ch.pos.distanceTo(f.pos) ? { kind: 'pickup', obj: pk } : { kind: 'chest', obj: ch };
      else if (pk) tgt = { kind: 'pickup', obj: pk };
      else if (ch) tgt = { kind: 'chest', obj: ch };
      if (tgt) {
        this.goal = tgt.obj.pos.clone();
        this.goalKind = tgt.kind;
        this.goalObj = tgt.obj;
        return;
      }
    }

    // Farm materials.
    if (totalMats < 150 && !this.target) {
      if (this.pickHarvest(30)) {
        this.goal = new THREE.Vector3(this.harvestTarget.center.x, 0, this.harvestTarget.center.z);
        this.goalKind = 'harvest';
        return;
      }
    }

    // Wander between POIs inside the safe zone.
    if (!this.goal || this.goalKind !== 'wander' || Math.hypot(this.goal.x - f.pos.x, this.goal.z - f.pos.z) < 6) {
      const c = storm.mode === 'idle' ? { x: 0, y: 0 } : storm.next.c;
      const r = storm.mode === 'idle' ? 160 : storm.next.r;
      const cand = POIS.filter((p) => Math.hypot(p.x - c.x, p.z - c.y) < r);
      const p = cand.length ? pick(cand) : { x: c.x + rand(-r, r) * 0.5, z: c.y + rand(-r, r) * 0.5, pad: 6 };
      this.goal = new THREE.Vector3(p.x + rand(-p.pad, p.pad) * 0.5, 0, p.z + rand(-p.pad, p.pad) * 0.5);
      this.goalKind = 'wander';
    }
  }

  pickHarvest(range) {
    const f = this.f;
    if (this.harvestTarget && !this.harvestTarget.dead) {
      const h = this.harvestTarget;
      if (Math.hypot(h.center.x - f.pos.x, h.center.z - f.pos.z) < range + 5) return h;
    }
    let best = null, bd = range;
    for (const h of this.game.world.harvestables) {
      if (h.dead) continue;
      const d = Math.hypot(h.center.x - f.pos.x, h.center.z - f.pos.z);
      if (d < bd) { bd = d; best = h; }
    }
    this.harvestTarget = best;
    return best;
  }

  act(dt) {
    const f = this.f;
    const g = this.game;
    let move = null; // desired horizontal direction
    let speed = PLAYER.runSpeed;
    let wantJump = false;

    if (this.goalKind === 'fight' && this.target) {
      const tgt = this.target;
      const toT = new THREE.Vector3().subVectors(tgt.pos, f.pos);
      const dist = Math.hypot(toT.x, toT.z);
      const wi = this.bestWeaponFor(dist);
      if (wi >= 0 && f.selected !== wi + 1) f.select(wi + 1);
      const w = f.weapon;
      const pref = w ? PREFERRED_RANGE[w.type] : 3;

      // Strafe while closing to preferred range.
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = rand(0.6, 1.6); }
      const fwd = new THREE.Vector3(toT.x / (dist || 1), 0, toT.z / (dist || 1));
      const side = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(this.strafe);
      const approach = dist > pref * 1.3 ? 1 : dist < pref * 0.6 ? -0.6 : 0;
      move = fwd.multiplyScalar(approach).add(side.multiplyScalar(0.8));
      if (Math.random() < dt * 0.4) wantJump = true;

      // Aim with human-ish error that tightens over time.
      const aimPoint = tgt.pos.clone().add(new THREE.Vector3(0, Math.random() < 0.15 + this.skill * 0.15 ? 1.7 : 1.15, 0));
      const eye = this.eye(f);
      const dir = aimPoint.sub(eye).normalize();
      f.yaw = Math.atan2(-dir.x, -dir.z);
      f.pitch = Math.asin(clamp(dir.y, -1, 1));
      this.reactT -= dt;
      const visible = g.time - this.targetSeenAt < 0.6;
      if (w && this.reactT <= 0) {
        const err = (0.05 + (1 - this.skill) * 0.09) * (1 + dist / 60);
        const d2 = dir.clone().add(new THREE.Vector3(rand(-err, err), rand(-err, err) * 0.6, rand(-err, err))).normalize();
        const spec = WEAPONS[w.type];
        if (w.mag <= 0) g.combat.tryReload(f);
        else if (dist < spec.range * 0.9 && (visible || Math.random() < 0.3)) {
          // Bots don't hold triggers perfectly: semi-autos get a little delay.
          if (spec.auto || Math.random() < dt * 8) g.combat.fire(f, eye, d2, { ads: dist > 20 });
        }
      } else if (!w) {
        // No usable gun: run at them with the pickaxe.
        f.select(0);
        move = fwd.clone();
        if (dist < 2.2) g.combat.swing(f, this.eye(f), dir);
      }
    } else if (this.goal) {
      const dx = this.goal.x - f.pos.x, dz = this.goal.z - f.pos.z;
      const d = Math.hypot(dx, dz);
      move = new THREE.Vector3(dx / (d || 1), 0, dz / (d || 1));
      if (this.goalKind !== 'heal') f.yaw = Math.atan2(-dx, -dz);
      if (this.goalKind === 'storm') speed = PLAYER.sprintSpeed;

      if (this.goalKind === 'pickup' && d < 1.4) {
        const p = this.goalObj;
        if (g.loot.pickups.includes(p)) g.pickupItem(f, p);
        this.goal = null;
      } else if (this.goalKind === 'chest' && d < 1.8) {
        g.loot.openChest(this.goalObj);
        this.goal = null;
      } else if (this.goalKind === 'harvest' && this.harvestTarget) {
        const h = this.harvestTarget;
        if (d < 1.9) {
          move = null;
          if (f.selected !== 0) f.select(0);
          const eye = this.eye(f);
          const dir = new THREE.Vector3(h.center.x - eye.x, h.center.y - eye.y, h.center.z - eye.z).normalize();
          f.pitch = Math.asin(clamp(dir.y, -1, 1));
          g.combat.swing(f, eye, dir);
        }
      }
    }

    if (this.goalKind === 'heal') {
      move = null;
      if (!f.heal) {
        const it = f.item;
        if (!it || it.kind !== 'consumable' || !g.combat.startHeal(f)) this.goalKind = '';
      }
    }

    // Detour when stuck on geometry: jump, then sidestep, then ramp over.
    if (this.detour) {
      this.detour.t -= dt;
      move = this.detour.dir;
      if (this.detour.t <= 0) this.detour = null;
    }
    this.lastPosT += dt;
    if (this.lastPosT > 0.8) {
      const moved = Math.hypot(f.pos.x - this.lastPos.x, f.pos.z - this.lastPos.z);
      if (move && moved < 0.5 && this.goalKind !== 'harvest' && this.goalKind !== 'heal') {
        this.stuckT += this.lastPosT;
        wantJump = true;
        if (this.stuckT > 1.6) {
          const a = Math.atan2(move.z, move.x) + (Math.random() < 0.5 ? 1.6 : -1.6);
          this.detour = { dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), t: rand(0.8, 1.6) };
          if (this.stuckT > 3.2 && this.matToUse()) {
            const yaw = Math.atan2(-move.x, -move.z);
            const t = g.builds.computeTarget('ramp', f.pos, yaw, 0);
            const m = this.matToUse();
            if (g.builds.place(t, m, f)) f.mats[m] -= BUILD_COST;
            this.stuckT = 0;
          }
        }
      } else {
        this.stuckT = 0;
      }
      this.lastPos.copy(f.pos);
      this.lastPosT = 0;
    }

    if (f.heal) speed = PLAYER.healSpeed;
    if (f.swimming) speed = PLAYER.swimSpeed;
    const tx = move ? move.x * speed : 0, tz = move ? move.z * speed : 0;
    const acc = f.onGround ? 10 : 2.5;
    f.vel.x += (tx - f.vel.x) * Math.min(1, acc * dt);
    f.vel.z += (tz - f.vel.z) * Math.min(1, acc * dt);
    if (wantJump && f.onGround) f.vel.y = PLAYER.jumpVel;
  }
}
