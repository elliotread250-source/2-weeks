// Online host. Talks to the game server over WebSocket and presents the same
// interface as LocalHost, so Game neither knows nor cares which it has.
//
// The client holds a replica Match built from the server's seed: static map,
// colliders and loot spawn identically, and server events keep it in sync. The
// local fighter is predicted (movement replayed from unacknowledged commands
// and reconciled on every snapshot); everyone else is interpolated ~100 ms in
// the past from buffered snapshots.
import { TICK_RATE, TICK_DT } from '/shared/config.js';
import { Match } from '/shared/sim/match.js';
import { Fighter } from '/shared/sim/fighter.js';
import { resolveOutfit } from '/shared/cosmetics/catalog.js';
import { applyMovement, HELD } from '/shared/sim/controller.js';
import { BUILD_COST, MATERIALS } from '/shared/config.js';
import { encodeCommands, decodeSnapshot, heldItem, MAX_CMDS_PER_PACKET } from '/shared/net/protocol.js';
import { applyWelcome, applyWireEvent, addRemotePiece } from '/shared/net/wire.js';

const INTERP_DELAY = 0.1; // seconds behind the server for remote fighters
const MAX_EXTRAPOLATE = 0.25;
const SNAP_DISTANCE = 2.5; // larger prediction errors snap instead of easing
const SMOOTH_TAU = 0.1;

export class NetHost {
  // Opens the socket, joins (or resumes) and resolves once welcomed.
  static connect(url, { name, resumeToken, loadout, onStatus = () => {} } = {}) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.binaryType = 'arraybuffer';
      const fail = (m) => reject(new Error(m));
      ws.onerror = () => fail("Can't reach the game server");
      ws.onclose = () => fail('Connection closed before the match started');
      ws.onopen = () => {
        ws.send(JSON.stringify(resumeToken ? { t: 'resume', token: resumeToken } : { t: 'join', name, mode: 'solo', loadout }));
        onStatus('Finding match...');
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return;
        const m = JSON.parse(e.data);
        if (m.t === 'lobby') onStatus(`Finding match... ${m.players}/${m.capacity}  (starts in ${m.secondsLeft}s)`);
        else if (m.t === 'resume-failed') fail('That match has ended');
        else if (m.t === 'welcome') {
          ws.onerror = ws.onclose = ws.onmessage = null;
          resolve(new NetHost(ws, m));
        }
      };
    });
  }

  constructor(ws, welcome) {
    this.ws = ws;
    this.online = true;
    this.token = welcome.token;
    this.closed = false;
    this.onClosed = () => {};
    this.rtt = 0;
    this.stats = { snapshots: 0, corrections: 0, snaps: 0, maxError: 0, errSum: 0, big: [] }; // for tests and the debug overlay

    const match = new Match({ seed: welcome.seed, botCount: 0, replica: true });
    this.match = match;
    for (const r of welcome.fighters) {
      const f = new Fighter(r.name, resolveOutfit(r.loadout), { human: r.human, loadout: r.loadout });
      f.id = r.id;
      f.hidden = r.id !== welcome.self;
      match.fighters.push(f);
    }
    this.local = match.fighters.find((f) => f.id === welcome.self);
    this.local.hidden = false;
    match.phase = welcome.phase;
    applyWelcome(match, welcome);

    this.acc = 0;
    this.seq = 0;
    this.predictedId = 0;
    this.nextBuildAt = 0;
    this.pending = []; // commands the server has not acknowledged yet
    this.samples = new Map(); // fighter id -> [{t, x, y, z, yaw}]
    this.offset = null; // serverTime - localTime
    this.events = [];
    this.lastPing = 0;

    ws.onmessage = (e) => this.onMessage(e);
    ws.onclose = () => { this.closed = true; this.onClosed(); };
    this.ping();
  }

  start() {}

  now() { return performance.now() / 1000; }
  serverNow() { return this.now() + (this.offset ?? 0); }

  ping() {
    this.lastPing = this.now();
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify({ t: 'ping', c: this.lastPing }));
  }

  // ------------------------------------------------------------ incoming

  onMessage(e) {
    if (typeof e.data !== 'string') {
      this.onSnapshot(decodeSnapshot(new Uint8Array(e.data)));
      return;
    }
    const m = JSON.parse(e.data);
    if (m.t === 'ev') for (const w of m.e) applyWireEvent(this.match, w);
    else if (m.t === 'pong') this.rtt = (this.now() - m.c) * 1000;
  }

  onSnapshot(s) {
    const match = this.match;
    const t = s.tick / TICK_RATE;
    const sample = t - this.now();
    this.offset = this.offset === null ? sample : this.offset + (sample - this.offset) * 0.05;
    match.phase = s.phase;
    match.resurgence = s.resurgence;
    match.aliveOverride = s.alive;
    match.time = s.time;
    match.tickCount = s.tick;
    this.applyStorm(s);
    if (match.bus) {
      match.bus.t = s.busT;
      match.bus.timeLeft = Math.max(0, match.bus.duration - s.busT);
      match.bus.pos.lerpVectors(match.bus.start, match.bus.end, Math.min(1, s.busT / match.bus.duration));
    }
    if (s.self) this.applySelf(s, t);
    for (const r of s.fighters) this.applyRemote(r, t);
    for (const id of s.removed) {
      const f = match.fighters.find((x) => x.id === id);
      if (f) f.hidden = true;
    }
    if (this.now() - this.lastPing > 2) this.ping();
  }

  applyStorm(s) {
    const st = this.match.storm;
    st.center.set(s.storm.cx, s.storm.cz);
    st.radius = s.storm.radius;
    st.next = { c: { x: s.storm.ncx, y: s.storm.ncz }, r: s.storm.nr };
    st.mode = s.storm.mode;
    st.phase = s.storm.phase;
    st.timer = s.storm.timer;
  }

  copyRecord(f, r) {
    f.alive = r.alive;
    f.state = r.state;
    f.onGround = r.onGround;
    f.swimming = r.swimming;
    f.ads = r.ads;
    f.scoped = r.scoped;
    f.buildMode = r.buildMode;
    f.editMode = r.editMode;
    f.hp = r.hp;
    f.shield = r.shield;
    f.selected = r.selected;
    f.swingT = r.swingT;
    f.vel.set(r.vx, r.vy, r.vz);
    f.crouch = r.crouch;
    f.emote = r.emote;
    f.fireFx = r.firing ? 0.1 : 0;
    f.placeFx = r.placing ? 0.1 : 0;
    f.hitFx = r.hitReact ? 0.2 : 0;
    f.hitHead = r.hitHead;
    f.hitDir = r.hitDir;
    f.animHeal = r.healing;
    f.animReload = r.reloading;
  }

  applyRemote(r, t) {
    const f = this.match.fighters.find((x) => x.id === r.id);
    if (!f) return;
    f.hidden = false;
    this.copyRecord(f, r);
    f.pitch = r.pitch;
    f.slots = [null, null, null, null, null];
    if (r.selected > 0) f.slots[r.selected - 1] = heldItem(r.heldCode, r.heldRarity);
    this.pushSample(f.id, t, r);
  }

  pushSample(id, t, r) {
    let buf = this.samples.get(id);
    if (!buf) { buf = []; this.samples.set(id, buf); }
    buf.push({ t, x: r.x, y: r.y, z: r.z, yaw: r.yaw, vx: r.vx, vy: r.vy, vz: r.vz });
    if (buf.length > 16) buf.shift();
  }

  // The local fighter: take server truth, then replay what the server hasn't
  // seen yet, and ease any visible correction.
  applySelf(s, t) {
    const f = this.local;
    const r = s.self;
    const before = { x: f.pos.x, y: f.pos.y, z: f.pos.z };
    const wasPredicted = this.predicting();
    const yaw = f.yaw, pitch = f.pitch;
    this.copyRecord(f, r);
    f.pos.set(r.x, r.y, r.z);
    f.yaw = yaw; f.pitch = pitch;
    Object.assign(f, {
      slots: s.selfPrivate.slots, ammo: s.selfPrivate.ammo, mats: s.selfPrivate.mats, kills: s.selfPrivate.kills,
      reloadT: s.selfPrivate.reloadT, heal: s.selfPrivate.heal, chestT: s.selfPrivate.chestT,
      respawnT: s.selfPrivate.respawnT, eliminated: s.selfPrivate.eliminated, placement: s.selfPrivate.placement,
      buildPiece: s.selfPrivate.buildPiece, buildMat: s.selfPrivate.buildMat, fireCd: s.selfPrivate.fireCd, bloom: s.selfPrivate.bloom,
    });
    const sp = s.selfPrivate;
    if (sp.editPiece) {
      const piece = this.match.builds.list.find((p) => p.id === sp.editPiece);
      const selected = [];
      for (let i = 0; i < 9; i++) if (sp.editMask & (1 << i)) selected.push(i);
      f.editing = piece ? { piece, selected } : null;
    } else f.editing = null;

    this.pending = this.pending.filter((c) => c.seq > s.ackSeq);
    this.pushSample(f.id, t, r);

    if (!this.predicting()) {
      f.smooth.x = f.smooth.y = f.smooth.z = 0;
      return;
    }
    this.match.collision.refreshGround(f);
    for (const cmd of this.pending) this.predictStep(cmd);
    if (wasPredicted) {
      const dx = before.x - f.pos.x, dy = before.y - f.pos.y, dz = before.z - f.pos.z;
      const err = Math.hypot(dx, dy, dz);
      this.stats.snapshots++;
      this.stats.errSum += err;
      if (err > 0.001) this.stats.corrections++;
      if (err > this.stats.maxError) this.stats.maxError = err;
      if (err > 1 && this.stats.big.length < 12) this.stats.big.push({ err: +err.toFixed(2), state: f.state, pend: this.pending.length, y: +f.pos.y.toFixed(1), onGround: f.onGround, d: [+dx.toFixed(2), +dy.toFixed(2), +dz.toFixed(2)] });
      if (err > SNAP_DISTANCE) { this.stats.snaps++; f.smooth.x = f.smooth.y = f.smooth.z = 0; }
      else if (err > 0.001) { f.smooth.x += dx; f.smooth.y += dy; f.smooth.z += dz; }
    }
    f.prev.x = f.pos.x; f.prev.y = f.pos.y; f.prev.z = f.pos.z;
  }

  // Show a placed piece immediately; the server confirms or rejects it. The
  // same rules the server applies (cost, range, support) decide whether to try.
  predictBuild(cmd) {
    const f = this.local;
    const m = this.match;
    if (!f.alive || f.airborne || !f.buildMode || f.editMode || !(cmd.held & HELD.FIRE)) return;
    if (this.now() < this.nextBuildAt) return;
    if (f.mats[f.buildMat] < BUILD_COST) return;
    const target = m.builds.computeTarget(f.buildPiece, f.pos, cmd.yaw, cmd.pitch);
    if (!m.builds.canPlace(target)) return;
    const spec = MATERIALS[f.buildMat];
    const [start, max] = target.type === 'wall' ? spec.wall : spec.other;
    const p = addRemotePiece(m, {
      id: --this.predictedId, type: target.type, gx: target.gx, gz: target.gz, baseY: target.baseY, axis: target.axis,
      dir: target.dir, mat: f.buildMat, owner: f.id, hp: start, maxHp: max, built: false, edits: [],
    });
    p.predicted = true;
    p.predAt = this.now();
    f.mats[f.buildMat] -= BUILD_COST; // the next snapshot corrects this if the server disagrees
    this.nextBuildAt = this.now() + 0.06;
    m.pushEvent('buildPlaced', { p });
    m.pushEvent('sfx', { name: 'build', by: f.id, own: true });
  }

  predicting() {
    const f = this.local;
    return f.alive && f.state !== 'bus';
  }

  predictStep(cmd) {
    const f = this.local;
    applyMovement(this.match, f, cmd, TICK_DT);
    this.match.physics(f, TICK_DT);
  }

  // ------------------------------------------------------------ per frame

  step(dt, sample) {
    const match = this.match;
    const f = this.local;
    this.acc += Math.min(dt, 0.25);
    const batch = [];
    let steps = 0;
    while (this.acc >= TICK_DT && steps < 5) {
      const cmd = sample();
      cmd.seq = ++this.seq;
      cmd.viewTick = Math.max(0, Math.floor((this.serverNow() - INTERP_DELAY) * TICK_RATE));
      batch.push(cmd);
      // Keep every command until acknowledged, even ones we can't predict (on the
      // bus, dead): once the server flips our state they must be replayed.
      this.predictBuild(cmd);
      this.pending.push(cmd);
      if (this.predicting()) {
        f.prev.x = f.pos.x; f.prev.y = f.pos.y; f.prev.z = f.pos.z;
        this.predictStep(cmd);
      } else {
        f.yaw = cmd.yaw; f.pitch = cmd.pitch;
      }
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps === 5) this.acc = 0;
    if (this.pending.length > 120) this.pending.splice(0, this.pending.length - 120);
    if (batch.length && this.ws.readyState === 1) {
      for (let i = 0; i < batch.length; i += MAX_CMDS_PER_PACKET) {
        this.ws.send(encodeCommands(batch.slice(i, i + MAX_CMDS_PER_PACKET)));
      }
    }

    // Predicted pieces the server never confirmed (rejected) fizzle out.
    const tNow = this.now();
    for (const p of [...match.builds.list]) {
      if (p.predicted && tNow - p.predAt > 1.2) {
        match.builds.destroy(p, 'fizz');
        match.pushEvent('buildDestroyed', { p, mode: 'fizz' });
      }
    }

    // Ease out prediction corrections.
    const k = Math.exp(-dt / SMOOTH_TAU);
    f.smooth.x *= k; f.smooth.y *= k; f.smooth.z *= k;

    // Everyone else (and ourselves while riding the bus or dead) comes from the
    // snapshot buffer, 100 ms in the past.
    const renderT = this.serverNow() - INTERP_DELAY;
    for (const fighter of match.fighters) {
      if (fighter === f && this.predicting()) continue;
      this.interpolate(fighter, renderT);
    }
    return { events: match.takeEvents(), alpha: this.predicting() ? this.acc / TICK_DT : 1 };
  }

  interpolate(f, t) {
    const buf = this.samples.get(f.id);
    if (!buf || !buf.length) return;
    let a = buf[0], b = buf[0];
    if (t >= buf[buf.length - 1].t) {
      const last = buf[buf.length - 1];
      const dt = Math.min(t - last.t, MAX_EXTRAPOLATE);
      f.pos.set(last.x + last.vx * dt, last.y + last.vy * dt, last.z + last.vz * dt);
      f.yaw = last.yaw;
    } else if (t > buf[0].t) {
      for (let i = buf.length - 1; i > 0; i--) {
        if (buf[i - 1].t <= t) { a = buf[i - 1]; b = buf[i]; break; }
      }
      const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
      f.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
      let dy = b.yaw - a.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      f.yaw = a.yaw + dy * k;
    } else {
      f.pos.set(buf[0].x, buf[0].y, buf[0].z);
      f.yaw = buf[0].yaw;
    }
    f.prev.x = f.pos.x; f.prev.y = f.pos.y; f.prev.z = f.pos.z;
  }

  close() {
    this.ws.onclose = null;
    this.ws.close();
  }
}

