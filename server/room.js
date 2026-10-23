// One authoritative match. Runs shared/sim at a fixed tick, applies each
// client's commands in order, and streams interest-filtered snapshots (binary)
// and events (JSON) back.
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { TICK_RATE, TICK_DT } from '../shared/config.js';
import { Match } from '../shared/sim/match.js';
import { emptyCommand } from '../shared/sim/controller.js';
import { encodeSnapshot, recordBytes, sameBytes } from '../shared/net/protocol.js';
import { serializeEvent, buildWelcome } from '../shared/net/wire.js';
import { recordMatch } from './results.js';

const TICK_MS = 1000 / TICK_RATE;
const SNAPSHOT_HZ = 20;
const INTEREST = 220; // metres: fighters further than this are not sent
const EVENT_INTEREST = 160;
const MAX_QUEUE = 12;
const BURST = 8; // commands a client may bank to ride out a network stall
const REWIND_TICKS = 6; // 200 ms at 30 Hz
const RECONNECT_MS = 30000;
const AFK_PROTECT_S = 10;

let nextRoomId = 1;

export class Room {
  constructor(opts) {
    this.id = nextRoomId++;
    this.capacity = opts.capacity;
    this.lobbySeconds = opts.lobbySeconds;
    this.humanTarget = opts.humanTarget ?? opts.capacity;
    this.mode = opts.mode || 'solo';
    this.state = 'lobby';
    this.clients = new Map(); // session token -> client
    this.createdAt = Date.now();
    this.lobbyEndsAt = 0;
    this.match = null;
    this.tickMs = []; // recent tick durations for load reporting
    this.maxTickMs = 0;
    this.nextTickAt = 0;
    this.timer = null;
    this.botBudget = opts.botBudget ?? (() => Infinity);
    this.onClose = opts.onClose || (() => {});
    this.db = opts.db || null;
  }

  get humans() { return [...this.clients.values()]; }
  get open() { return this.state === 'lobby' && this.clients.size < this.humanTarget; }

  add(client) {
    client.room = this;
    client.token = crypto.randomBytes(16).toString('hex');
    this.clients.set(client.token, client);
    if (!this.lobbyEndsAt) this.lobbyEndsAt = Date.now() + this.lobbySeconds * 1000;
    this.broadcastLobby();
    if (this.clients.size >= this.humanTarget) this.start();
    else if (!this.timer) this.timer = setInterval(() => this.lobbyTick(), 500);
  }

  lobbyTick() {
    if (this.state !== 'lobby') return;
    this.broadcastLobby();
    if (Date.now() >= this.lobbyEndsAt) this.start();
  }

  broadcastLobby() {
    const msg = JSON.stringify({
      t: 'lobby', players: this.clients.size, capacity: this.capacity,
      secondsLeft: Math.max(0, Math.ceil((this.lobbyEndsAt - Date.now()) / 1000)),
    });
    for (const c of this.clients.values()) c.sendText(msg);
  }

  // ------------------------------------------------------------ match

  start() {
    if (this.state !== 'lobby') return;
    this.state = 'playing';
    clearInterval(this.timer);
    this.timer = null;
    const humans = this.humans.filter((c) => c.connected);
    const match = new Match({ keepHistory: true });
    this.match = match;
    humans.forEach((c) => {
      c.fighter = match.addHuman(c.name, c.loadout || undefined);
      c.known = new Map();
      c.lastSeq = 0;
      c.queue = [];
      c.budget = 3;
      c.lastCmd = emptyCommand();
    });
    const bots = Math.max(0, Math.min(this.capacity - humans.length, this.botBudget()));
    match.addBots(bots);
    match.start();
    for (const c of humans) {
      c.sendText(JSON.stringify({ ...buildWelcome(match, c.fighter.id), token: c.token }));
    }
    this.nextTickAt = performance.now() + TICK_MS;
    this.loop();
  }

  loop() {
    if (this.state !== 'playing') return;
    const now = performance.now();
    let n = 0;
    while (this.nextTickAt <= now && n < 3) {
      const t0 = performance.now();
      this.step();
      const dt = performance.now() - t0;
      this.tickMs.push(dt);
      if (this.tickMs.length > 150) this.tickMs.shift();
      if (dt > this.maxTickMs) this.maxTickMs = dt;
      this.nextTickAt += TICK_MS;
      n++;
    }
    if (n === 3) this.nextTickAt = now + TICK_MS; // fell behind: skip ahead rather than spiral
    this.timer = setTimeout(() => this.loop(), Math.max(1, this.nextTickAt - performance.now()));
  }

  get avgTickMs() {
    return this.tickMs.length ? this.tickMs.reduce((a, b) => a + b, 0) / this.tickMs.length : 0;
  }

  step() {
    const m = this.match;
    const now = Date.now();
    for (const c of this.clients.values()) {
      if (!c.fighter) continue;
      this.feed(c);
      if (!c.connected && now > c.dropAt && !c.abandoned) {
        c.abandoned = true; // slot freed; the fighter stays on the island, idle
        c.lastCmd = emptyCommand();
      }
    }
    m.tick(TICK_DT);
    const events = m.takeEvents();
    const sendSnap = Math.floor(m.tickCount * SNAPSHOT_HZ / TICK_RATE) !== Math.floor((m.tickCount - 1) * SNAPSHOT_HZ / TICK_RATE);
    for (const c of this.clients.values()) {
      if (!c.connected || !c.fighter) continue;
      this.sendEvents(c, events, m);
      if (sendSnap) this.sendSnapshot(c, m);
    }
    if (m.phase === 'over' && !this.overAt) {
      this.overAt = now;
      if (this.db) {
        recordMatch(this.db, this).then(() => {
          // Tell each signed-in player what the match paid and which challenges it finished.
          for (const c of this.clients.values()) {
            const r = this.rewards && this.rewards.get(c.userId);
            if (r && c.connected) c.sendText(JSON.stringify({ t: 'reward', ...r }));
          }
        }).catch((e) => console.error('[results]', e.message));
      }
    }
    if (this.overAt && now - this.overAt > 8000) this.close();
  }

  // Hand the match this tick's share of a client's queued commands. A client
  // earns one command per tick (plus a small burst allowance for jitter), so a
  // flood of commands cannot make a player move faster than real time.
  feed(c) {
    const m = this.match;
    c.budget = Math.min(c.budget + 1, BURST);
    while (c.queue.length && c.budget >= 1) {
      const cmd = c.queue.shift();
      c.budget -= 1;
      // Lag compensation window: never rewind further than 200 ms.
      if (cmd.viewTick) cmd.viewTick = Math.min(m.tickCount, Math.max(cmd.viewTick, m.tickCount - REWIND_TICKS));
      c.lastSeq = cmd.seq;
      c.lastCmd = cmd;
      m.setCommand(c.fighter.id, cmd);
    }
    // Far behind (a long stall, or a flood): drop the oldest, keeping their presses.
    if (c.queue.length > MAX_QUEUE) {
      let carry = 0;
      while (c.queue.length > MAX_QUEUE) carry |= c.queue.shift().act;
      c.queue[0].act |= carry;
    }
    // A player who left stands still (and falls, if airborne) instead of freezing mid-air.
    if (!c.connected) {
      m.setCommand(c.fighter.id, { ...emptyCommand(), seq: c.lastSeq, yaw: c.lastCmd.yaw, pitch: c.lastCmd.pitch });
    }
  }

  centre(c) {
    const f = c.fighter;
    if (f.alive || !c.spectate) return f.pos;
    const t = this.match.fighters.find((x) => x.id === c.spectate);
    return t && t.alive ? t.pos : f.pos;
  }

  sendEvents(c, events, m) {
    const out = [];
    const ctr = this.centre(c);
    for (const ev of events) {
      if (ev.type === 'spectate' && ev.id === c.fighter.id) c.spectate = ev.killer;
      const { wire, to, at } = serializeEvent(ev, m);
      if (wire.__both) {
        if (!wire.__both.includes(c.fighter.id)) continue;
      } else if (to !== null) {
        if (to !== c.fighter.id) continue;
      } else if (at) {
        if (Math.hypot(at.x - ctr.x, at.z - ctr.z) > EVENT_INTEREST) continue;
      }
      delete wire.__both;
      out.push(wire);
    }
    if (out.length) c.sendText(JSON.stringify({ t: 'ev', tick: m.tickCount, e: out }));
  }

  sendSnapshot(c, m) {
    const ctr = this.centre(c);
    const updated = [];
    const seen = new Set();
    for (const f of m.fighters) {
      if (f === c.fighter) continue;
      if (Math.hypot(f.pos.x - ctr.x, f.pos.z - ctr.z) > INTEREST) continue;
      seen.add(f.id);
      const bytes = recordBytes(f);
      if (!sameBytes(c.known.get(f.id), bytes)) { updated.push(f); c.known.set(f.id, bytes); }
    }
    const removed = [];
    for (const id of c.known.keys()) if (!seen.has(id)) { removed.push(id); c.known.delete(id); }
    c.sendBinary(encodeSnapshot({ tick: m.tickCount, ackSeq: c.lastSeq, match: m, self: c.fighter, updated, removed }));
  }

  // ------------------------------------------------------------ clients

  onCommands(c, cmds) {
    for (const cmd of cmds) {
      if (cmd.seq <= (c.lastQueuedSeq || 0)) { c.violate('stale command sequence'); continue; }
      c.lastQueuedSeq = cmd.seq;
      c.queue.push(cmd);
    }
    if (c.queue.length > 30) c.queue.splice(0, c.queue.length - 30);
  }

  resume(c, token) {
    const old = this.clients.get(token);
    if (!old || old.abandoned || old === c) return false;
    old.ws?.close?.(4000, 'replaced');
    old.ws = c.ws;
    old.connected = true;
    old.known = new Map();
    old.queue = [];
    c.adopt(old);
    this.match.fighters.find((f) => f === old.fighter).invulnUntil = this.match.time + 2;
    old.sendText(JSON.stringify({ ...buildWelcome(this.match, old.fighter.id), token, resumed: true }));
    return true;
  }

  drop(c) {
    if (this.state === 'lobby') {
      this.clients.delete(c.token);
      this.broadcastLobby();
      if (!this.clients.size) this.close();
      return;
    }
    c.connected = false;
    c.dropAt = Date.now() + RECONNECT_MS;
    if (c.fighter) c.fighter.invulnUntil = this.match.time + AFK_PROTECT_S;
    if (![...this.clients.values()].some((x) => x.connected)) {
      setTimeout(() => { if (![...this.clients.values()].some((x) => x.connected)) this.close(); }, RECONNECT_MS);
    }
  }

  close() {
    if (this.state === 'closed') return;
    this.state = 'closed';
    clearInterval(this.timer);
    clearTimeout(this.timer);
    for (const c of this.clients.values()) c.ws?.close?.(1000, 'match ended');
    this.onClose(this);
  }

  stats() {
    return {
      id: this.id, state: this.state, humans: this.clients.size, fighters: this.match ? this.match.fighters.length : 0,
      alive: this.match ? this.match.aliveCount() : 0, avgTickMs: +this.avgTickMs.toFixed(2), maxTickMs: +this.maxTickMs.toFixed(2),
    };
  }
}
