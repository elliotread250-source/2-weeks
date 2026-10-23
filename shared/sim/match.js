// One match: map, fighters, drop bus, storm, eliminations, Resurgence redeploys
// and the win condition. Runs at a fixed tick (config.TICK_RATE) with no
// renderer and no DOM, so the browser (offline) and the server share it.
//
// Everything the outside world needs to react to (sounds, particles, HUD text,
// build/loot/world changes) comes out as events in `this.events`; a host drains
// it every tick with `takeEvents()`.
import {
  PLAYER, BOT_COUNT, RESURGENCE_END_PHASE, RESURGENCE_DELAY, TICK_DT,
} from '../config.js';
import { GAME, BOT_NAMES } from '../names.js';
import { Rng } from '../math/util.js';
import { Vec3 } from '../math/vec3.js';
import { CollisionWorld } from './collision.js';
import { terrainHeight } from './terrain.js';
import { World } from './world.js';
import { BuildSystem } from './building.js';
import { LootSystem } from './loot.js';
import { Fighter } from './fighter.js';
import { BotBrain } from './bot.js';
import { Combat } from './combat.js';
import { Storm } from './storm.js';
import { applyCommand } from './controller.js';
import { DEFAULT_LOADOUT, resolveOutfit, randomLoadout } from '../cosmetics/catalog.js';

export class Match {
  constructor(opts = {}) {
    this.seed = opts.seed ?? (Math.random() * 2 ** 31) >>> 0;
    this.rng = new Rng(this.seed);
    this.botCount = opts.botCount ?? BOT_COUNT;
    this.events = [];
    this.time = 0;
    this.tickCount = 0;
    this.phase = 'init'; // init -> bus -> play -> over
    this.resurgence = opts.resurgence ?? true;
    this.stormTick = 0;
    this.mapDirty = [];
    this.inbox = new Map(); // fighter id -> commands waiting to be applied, oldest first
    this.replica = !!opts.replica; // client mirror of a server match: never ticked, events come from the wire
    this.keepHistory = !!opts.keepHistory; // server: remember positions for lag compensation
    this.history = [];
    this.fighters = [];

    const emit = (type, data) => this.emit(type, data);
    this.collision = new CollisionWorld(terrainHeight);
    this.world = new World(this.collision, { emit }).build();
    this.builds = new BuildSystem(this.collision, this.rng, emit);
    this.loot = new LootSystem(this.collision, this.rng, emit);
    this.loot.spawnFromSpots(this.world.lootSpots);
    this.storm = new Storm(this.rng);
    this.combat = new Combat(this);
  }

  // Sim-originated events. A replica never simulates, so it drops these and
  // gets its events from the server through pushEvent().
  emit(type, data = {}) {
    if (this.replica) return;
    if (type === 'staticBroken') this.mapDirty.push(data.el);
    this.events.push({ type, ...data });
  }

  pushEvent(type, data = {}) {
    this.events.push({ type, ...data });
  }

  takeEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ------------------------------------------------------------ roster

  addHuman(name, loadout = DEFAULT_LOADOUT) {
    const f = new Fighter(name, resolveOutfit(loadout), { human: true, loadout });
    this.fighters.push(f);
    this.inbox.set(f.id, []);
    return f;
  }

  addBots(count = this.botCount) {
    const names = [...BOT_NAMES].sort(() => this.rng.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const loadout = randomLoadout(this.rng);
      const f = new Fighter(names[i % names.length], resolveOutfit(loadout), { loadout });
      new BotBrain(this, f, this.rng.range(0.15, 0.85));
      this.fighters.push(f);
    }
  }

  // Each command is one tick of that player's own time: it is applied (with
  // movement physics) exactly once, in order, whenever it arrives. A tick with
  // no command leaves the player where they are, so the server never simulates
  // time the client did not, and prediction replays the same steps.
  setCommand(fighterId, cmd) {
    this.inbox.get(fighterId).push(cmd);
  }

  get humans() {
    return this.fighters.filter((f) => f.human);
  }

  aliveCount() {
    if (this.replica && this.aliveOverride != null) return this.aliveOverride;
    return this.fighters.filter((f) => !f.eliminated).length;
  }

  // ------------------------------------------------------------ match flow

  start() {
    this.phase = 'bus';
    this.setupBus();
    for (const f of this.fighters) {
      f.reset();
      f.state = 'bus';
      f.pos.copy(this.bus.pos);
    }
    this.emit('matchStart', {});
    this.emit('message', { to: null, text: GAME.busUpper, sub: 'jump', dur: 4, key: 'busStart' });
    this.emit('sfx', { name: 'horn' });
  }

  setupBus() {
    const r = this.rng;
    const a = r.random() * Math.PI * 2;
    const dir = new Vec3(Math.cos(a), 0, Math.sin(a));
    const perp = new Vec3(-dir.z, 0, dir.x).multiplyScalar(r.range(-50, 50));
    const start = dir.clone().multiplyScalar(-300).add(perp);
    const end = dir.clone().multiplyScalar(300).add(perp);
    start.y = end.y = 115;
    this.bus = { start, end, dir, pos: start.clone(), t: 0, duration: 30, timeLeft: 30 };
  }

  jumpFromBus(f) {
    if (f.state !== 'bus') return;
    if (this.bus.t < 1.5) return; // doors open after a moment
    f.state = 'skydive';
    f.pos.copy(this.bus.pos).add(new Vec3(this.rng.range(-1, 1), -4, this.rng.range(-1, 1)));
    f.vel.copy(this.bus.dir).multiplyScalar(8);
    this.emit('jumped', { id: f.id });
  }

  updateBus(dt) {
    const b = this.bus;
    b.t += dt;
    b.timeLeft = Math.max(0, b.duration - b.t);
    const k = Math.min(1, b.t / b.duration);
    b.pos.lerpVectors(b.start, b.end, k);

    for (const f of this.fighters) {
      if (f.state !== 'bus') continue;
      if (!f.human && f.brain && b.t > 1.5) {
        const d = Math.hypot(b.pos.x - f.brain.dropTarget.x, b.pos.z - f.brain.dropTarget.y);
        const passed = f.brain.prevBusDist !== undefined && d > f.brain.prevBusDist;
        f.brain.prevBusDist = d;
        if ((passed || d < 25) && (f.brain.jumpDelay -= dt) <= 0) this.jumpFromBus(f);
      }
      if (f.state === 'bus') f.pos.copy(b.pos);
    }
    if (k >= 1) {
      for (const f of this.fighters) if (f.state === 'bus') this.jumpFromBus(f);
      this.phase = 'play';
      this.storm.start();
      this.emit('message', { to: null, text: 'STORM EYE FORMING', sub: 'Check your map', dur: 3, key: 'stormForming' });
    }
  }

  // ------------------------------------------------------------ physics

  physics(f, dt) {
    if (f.state === 'bus' || !f.alive) return;
    const col = this.collision;
    if (f.state === 'skydive') {
      f.vel.y = -(f.dive || (f.brain && f.brain.dive) ? PLAYER.skydiveDive : PLAYER.skydiveFall);
      f.onGround = false;
      col.moveBody(f, dt);
      const above = f.pos.y - f.groundY;
      if (above < PLAYER.autoGlideHeight && !f.onGround) {
        f.state = 'glide';
        this.emit('sfx', { name: 'glider', by: f.id, own: true });
      }
      if (f.onGround) this.land(f);
    } else if (f.state === 'glide') {
      f.vel.y = -PLAYER.glideFall;
      f.onGround = false;
      col.moveBody(f, dt);
      if (f.onGround || f.swimming) this.land(f);
    } else {
      f.vel.y -= PLAYER.gravity * dt;
      if (f.swimming && f.vel.y < -2) f.vel.y = -2;
      col.moveBody(f, dt);
    }
  }

  land(f) {
    f.state = 'ground';
    f.vel.y = 0;
    this.emit('landed', { id: f.id });
  }

  // ------------------------------------------------------------ loot

  pickupItem(f, pk) {
    const left = f.give(pk.item);
    if (left === null) this.loot.remove(pk);
    else pk.item = left;
    this.emit('sfx', { name: 'pickup', by: f.id, own: true });
  }

  autoPickup() {
    for (const f of this.fighters) {
      if (!f.alive || f.state !== 'ground') continue;
      for (let i = this.loot.pickups.length - 1; i >= 0; i--) {
        const pk = this.loot.pickups[i];
        if (!pk.settled || pk.age < 0.6) continue;
        const dx = pk.pos.x - f.pos.x, dz = pk.pos.z - f.pos.z, dy = pk.pos.y - f.pos.y;
        if (dx * dx + dz * dz > 1.7 * 1.7 || Math.abs(dy) > 1.8) continue;
        const k = pk.item.kind;
        // Ammo and materials auto-pick. Weapons and heals need the interact
        // key for humans; bots grab them when they have a free slot.
        if (k === 'ammo' || k === 'mat') this.pickupItem(f, pk);
        else if (!f.human && pk.age > 1.5 && f.slots.includes(null)) this.pickupItem(f, pk);
      }
    }
  }

  // ------------------------------------------------------------ deaths

  eliminate(target, source, weaponName) {
    if (!target.alive) return;
    target.alive = false;
    target.state = 'dead';
    target.heal = null;
    const at = { x: target.pos.x, y: target.pos.y, z: target.pos.z };
    this.emit('eliminated', { id: target.id, pos: at, color: target.outfit.shirt });
    for (const it of target.dropAll()) this.loot.drop(it, target.pos.clone().add(new Vec3(0, 1, 0)), true);

    const killer = source && source !== target ? source : (target.lastHitBy && this.time - target.lastHitBy.t < 10 ? target.lastHitBy.f : null);
    if (killer) killer.kills++;
    const text = killer
      ? `${killer.name} eliminated ${target.name}${weaponName ? ` with ${weaponName}` : ''}`
      : `${target.name} was eliminated by ${weaponName || GAME.storm}`;
    this.emit('feed', { text, killer: killer ? killer.id : null, target: target.id });
    if (killer) this.emit('message', { to: killer.id, text: '', sub: `ELIMINATED ${target.name.toUpperCase()}`, dur: 2, sfx: 'elim' });
    this.emit('spectate', { id: target.id, killer: killer && killer.alive ? killer.id : null });

    if (this.resurgence) {
      target.respawnT = RESURGENCE_DELAY;
    } else {
      this.eliminateForGood(target);
      if (target.human) return;
    }
    this.checkWin();
  }

  eliminateForGood(f) {
    f.eliminated = true;
    f.diedAt = this.time;
    f.placement = this.aliveCount() + 1;
    if (f.human) this.emit('placement', { id: f.id, placement: f.placement, kills: f.kills, won: false });
    this.checkOver();
  }

  // Match is over for everyone once no human is left, or one fighter remains.
  checkOver() {
    if (this.phase === 'over') return;
    if (this.humans.length && this.humans.every((h) => h.eliminated)) this.end();
  }

  checkWin() {
    if (this.phase === 'over' || this.resurgence) return;
    const left = this.fighters.filter((f) => !f.eliminated);
    if (left.length === 1 && left[0].human) {
      left[0].placement = 1;
      left[0].diedAt = this.time;
      this.emit('placement', { id: left[0].id, placement: 1, kills: left[0].kills, won: true });
      this.end();
    }
  }

  end() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.emit('matchOver', {});
  }

  respawn(f) {
    f.reset();
    // Redeploy over a random spot inside the safe zone, Rebirth style.
    const r = this.rng;
    const c = this.storm.mode === 'idle' ? { x: 0, y: 0 } : this.storm.next.c;
    const rad = this.storm.mode === 'idle' ? 150 : Math.max(10, this.storm.next.r * 0.8);
    let x = 0, z = 0;
    for (let i = 0; i < 30; i++) {
      const a = r.random() * Math.PI * 2, d = Math.sqrt(r.random()) * rad;
      x = c.x + Math.cos(a) * d; z = c.y + Math.sin(a) * d;
      if (terrainHeight(x, z) > 2) break;
    }
    f.pos.set(x, terrainHeight(x, z) + 95, z);
    f.vel.set(0, 0, 0);
    f.state = 'skydive';
    if (f.brain) {
      f.brain.resetForDrop();
      f.brain.dropTarget.set(x + r.range(-30, 30), z + r.range(-30, 30));
    }
    this.emit('respawned', { id: f.id });
    if (f.human) this.emit('message', { to: f.id, text: 'REDEPLOYED', sub: 'Find a weapon fast!', dur: 2.5 });
  }

  settleAfterBreak() {
    const els = this.mapDirty;
    this.mapDirty = [];
    if (this.builds.list.length) this.builds.collapseUnsupported();
    const near = (pos) => els.some((el) => pos.x > el.min.x - 1 && pos.x < el.max.x + 1 && pos.z > el.min.z - 1 && pos.z < el.max.z + 1 && pos.y >= el.min.y - 0.5 && pos.y <= el.max.y + 1.5);
    for (const pk of this.loot.pickups) if (near(pk.pos)) { pk.settled = false; pk.vel.set(0, 0, 0); }
    for (const ch of this.loot.chests) {
      if (!near(ch.pos)) continue;
      ch.pos.y = this.collision.groundHeight(ch.pos.x, ch.pos.z, ch.pos.y + 0.2, 0.3);
      ch.moved = true;
      this.emit('chestMoved', { c: ch });
    }
  }

  // ------------------------------------------------------------ tick

  tick(dt = TICK_DT) {
    this.time += dt;
    this.tickCount++;
    for (const f of this.fighters) {
      f.prev.x = f.pos.x; f.prev.y = f.pos.y; f.prev.z = f.pos.z; f.prev.yaw = f.yaw;
    }
    if (this.phase === 'bus') this.updateBus(dt);

    for (const f of this.fighters) {
      if (f.human) {
        const q = this.inbox.get(f.id);
        while (q.length) {
          applyCommand(this, f, q.shift(), dt);
          this.physics(f, dt);
        }
      } else if (f.brain && f.alive) f.brain.update(dt);
    }
    for (const f of this.fighters) if (!f.human) this.physics(f, dt);
    this.combat.update(dt);
    this.autoPickup();

    // Storm.
    if (this.phase === 'play' || this.phase === 'over') {
      const ev = this.storm.update(dt);
      if (ev === 'shrinking') {
        this.emit('message', { to: null, text: 'STORM EYE SHRINKING', sub: '', dur: 3, sfx: 'storm' });
      } else if (ev === 'newPhase') {
        if (this.resurgence && this.storm.phase >= RESURGENCE_END_PHASE) {
          this.resurgence = false;
          this.emit('message', { to: null, text: 'RESURGENCE OFF', sub: 'No more redeploys. Every life counts.', dur: 4 });
          for (const f of this.fighters) {
            if (!f.alive && !f.eliminated) this.eliminateForGood(f);
          }
          this.checkWin();
        } else {
          this.emit('message', { to: null, text: 'STORM EYE FORMING', sub: 'Check your map', dur: 3, key: 'stormForming' });
        }
      }
      this.stormTick -= dt;
      if (this.stormTick <= 0) {
        this.stormTick = 1;
        for (const f of this.fighters) {
          if (f.alive && f.state !== 'bus' && this.storm.outside(f.pos)) {
            this.combat.applyDamage(f, this.storm.damage, null, { storm: true });
          }
        }
      }
    }

    // Resurgence redeploys.
    for (const f of this.fighters) {
      if (!f.alive && !f.eliminated && f.respawnT !== undefined) {
        f.respawnT -= dt;
        if (f.respawnT <= 0 && this.resurgence) {
          f.respawnT = undefined;
          this.respawn(f);
        }
      }
    }

    if (this.mapDirty.length) this.settleAfterBreak();
    this.world.update(this.time);
    this.builds.update(dt);
    this.loot.update(dt);
    if (this.keepHistory) this.recordHistory();
  }

  // ------------------------------------------------------------ lag compensation

  recordHistory() {
    const snap = { tick: this.tickCount, at: new Map() };
    for (const f of this.fighters) {
      snap.at.set(f.id, { x: f.pos.x, y: f.pos.y, z: f.pos.z, airborne: f.airborne });
    }
    this.history.push(snap);
    if (this.history.length > 30) this.history.shift(); // one second
  }

  // Where fighter f stood at `tick` (clamped to what we remember).
  positionAt(f, tick) {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].tick <= tick) return this.history[i].at.get(f.id) || null;
    }
    return null;
  }
}

