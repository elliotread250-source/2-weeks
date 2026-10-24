// Wire format. Per-tick traffic is binary (DataView, little endian): input
// commands going up, snapshots coming down. Rare, structured messages (welcome,
// roster, game events, lobby status) are JSON text frames.
//
// WebSocket is TCP, so delivery is ordered and reliable; "delta encoding" here
// means we only send entities whose quantised state changed since we last sent
// them to that client, and we send explicit removals when they leave interest.
import { WEAPONS, CONSUMABLES, EMOTE_COUNT } from '../config.js';

export const MSG = { CMD: 0x01, SNAPSHOT: 0x81 };

export const WEAPON_KEYS = Object.keys(WEAPONS);
export const CONSUMABLE_KEYS = Object.keys(CONSUMABLES);
export const AMMO_KEYS = ['light', 'medium', 'heavy', 'shells', 'rockets'];
export const STATE_KEYS = ['bus', 'ground', 'skydive', 'glide', 'dead'];
export const PHASE_KEYS = ['init', 'bus', 'play', 'over'];
export const STORM_MODES = ['idle', 'wait', 'shrink', 'done'];

const TWO_PI = Math.PI * 2;
const POS_SCALE = 64; // 1.5 cm over +/-512 m
const VEL_SCALE = 256;

export const QUANT = {
  pos: (v) => Math.max(-32768, Math.min(32767, Math.round(v * POS_SCALE))),
  unpos: (q) => q / POS_SCALE,
  vel: (v) => Math.max(-32768, Math.min(32767, Math.round(v * VEL_SCALE))),
  unvel: (q) => q / VEL_SCALE,
  yaw: (a) => Math.round((((a % TWO_PI) + TWO_PI) % TWO_PI) / TWO_PI * 65535),
  unyaw: (q) => (q / 65535) * TWO_PI,
  pitch: (p) => Math.max(-127, Math.min(127, Math.round(p / 1.6 * 127))),
  unpitch: (q) => (q / 127) * 1.6,
};

// ---------------------------------------------------------------- byte helpers

export class Writer {
  constructor(size = 1024) {
    this.buf = new ArrayBuffer(size);
    this.v = new DataView(this.buf);
    this.o = 0;
  }

  ensure(n) {
    if (this.o + n <= this.buf.byteLength) return;
    const nb = new ArrayBuffer(Math.max(this.buf.byteLength * 2, this.o + n));
    new Uint8Array(nb).set(new Uint8Array(this.buf));
    this.buf = nb;
    this.v = new DataView(nb);
  }

  u8(x) { this.ensure(1); this.v.setUint8(this.o, x); this.o += 1; return this; }
  i8(x) { this.ensure(1); this.v.setInt8(this.o, x); this.o += 1; return this; }
  u16(x) { this.ensure(2); this.v.setUint16(this.o, x, true); this.o += 2; return this; }
  i16(x) { this.ensure(2); this.v.setInt16(this.o, x, true); this.o += 2; return this; }
  u32(x) { this.ensure(4); this.v.setUint32(this.o, x >>> 0, true); this.o += 4; return this; }
  f32(x) { this.ensure(4); this.v.setFloat32(this.o, x, true); this.o += 4; return this; }
  bytes() { return new Uint8Array(this.buf, 0, this.o); }
}

export class Reader {
  constructor(data) {
    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    this.o = 0;
    this.len = u8.byteLength;
  }

  need(n) { if (this.o + n > this.len) throw new RangeError('short packet'); }
  u8() { this.need(1); const x = this.v.getUint8(this.o); this.o += 1; return x; }
  i8() { this.need(1); const x = this.v.getInt8(this.o); this.o += 1; return x; }
  u16() { this.need(2); const x = this.v.getUint16(this.o, true); this.o += 2; return x; }
  i16() { this.need(2); const x = this.v.getInt16(this.o, true); this.o += 2; return x; }
  u32() { this.need(4); const x = this.v.getUint32(this.o, true); this.o += 4; return x; }
  f32() { this.need(4); const x = this.v.getFloat32(this.o, true); this.o += 4; return x; }
}

// ---------------------------------------------------------------- commands

const CMD_BYTES = 26;
export const MAX_CMDS_PER_PACKET = 8;

export function encodeCommands(cmds) {
  const w = new Writer(2 + cmds.length * CMD_BYTES);
  w.u8(MSG.CMD).u8(cmds.length);
  for (const c of cmds) {
    w.u32(c.seq).u32(c.viewTick || 0);
    w.i8(Math.round(c.mx * 127)).i8(Math.round(c.mz * 127));
    w.f32(c.yaw).f32(c.pitch);
    w.u8(c.held).u16(c.act);
    w.i8(c.slot).i8(c.slotStep).i8(c.piece).i8(c.matStep).i8(c.emote || 0);
  }
  return w.bytes();
}

// Returns an array of commands, sanitised: the server never trusts a field.
export function decodeCommands(data) {
  const r = new Reader(data);
  if (r.u8() !== MSG.CMD) throw new Error('not a command packet');
  const n = Math.min(r.u8(), MAX_CMDS_PER_PACKET);
  const out = [];
  for (let i = 0; i < n; i++) {
    const seq = r.u32(), viewTick = r.u32();
    const mx = r.i8() / 127, mz = r.i8() / 127;
    const yaw = r.f32(), pitch = r.f32();
    const held = r.u8(), act = r.u16();
    const slot = r.i8(), slotStep = r.i8(), piece = r.i8(), matStep = r.i8(), emote = r.i8();
    out.push(sanitizeCommand({ seq, viewTick, mx, mz, yaw, pitch, held, act, slot, slotStep, piece, matStep, emote }));
  }
  return out;
}

const fin = (x, d = 0) => (Number.isFinite(x) ? x : d);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function sanitizeCommand(c) {
  return {
    seq: c.seq >>> 0,
    viewTick: c.viewTick >>> 0,
    mx: clamp(fin(c.mx), -1, 1),
    mz: clamp(fin(c.mz), -1, 1),
    yaw: fin(c.yaw) % (Math.PI * 200),
    pitch: clamp(fin(c.pitch), -1.5, 1.5),
    held: c.held & 0xff,
    act: c.act & 0xfff,
    slot: clamp(c.slot | 0, -1, 5),
    slotStep: clamp(c.slotStep | 0, -1, 1),
    piece: clamp(c.piece | 0, -1, 3),
    matStep: clamp(c.matStep | 0, -1, 1),
    emote: clamp(c.emote | 0, -1, EMOTE_COUNT),
  };
}

// ---------------------------------------------------------------- fighter records

const F = { ALIVE: 1, GROUND: 2, SWIM: 4, ADS: 8, SCOPED: 16, BUILD: 32, EDIT: 64, HUMAN: 128 };

function heldOf(f) {
  if (f.selected === 0) return { code: 255, rarity: 0 };
  const it = f.slots[f.selected - 1];
  if (!it) return { code: 0, rarity: 0 };
  if (it.kind === 'weapon') return { code: 1 + WEAPON_KEYS.indexOf(it.type), rarity: it.rarity };
  if (it.kind === 'consumable') return { code: 20 + CONSUMABLE_KEYS.indexOf(it.type), rarity: 0 };
  return { code: 0, rarity: 0 };
}

export function writeRecord(w, f) {
  const held = heldOf(f);
  const flags = (f.alive ? F.ALIVE : 0) | (f.onGround ? F.GROUND : 0) | (f.swimming ? F.SWIM : 0)
    | (f.ads ? F.ADS : 0) | (f.scoped ? F.SCOPED : 0) | (f.buildMode ? F.BUILD : 0)
    | (f.editMode ? F.EDIT : 0) | (f.human ? F.HUMAN : 0);
  w.u16(f.id).u8(flags).u8(Math.max(0, STATE_KEYS.indexOf(f.state)));
  w.i16(QUANT.pos(f.pos.x)).i16(QUANT.pos(f.pos.y)).i16(QUANT.pos(f.pos.z));
  w.i16(QUANT.vel(f.vel.x)).i16(QUANT.vel(f.vel.y)).i16(QUANT.vel(f.vel.z));
  w.u16(QUANT.yaw(f.yaw)).i8(QUANT.pitch(f.pitch));
  w.u8(Math.ceil(f.hp)).u8(Math.ceil(f.shield)).u8(f.selected).u8(held.code).u8(held.rarity);
  w.u8(Math.min(255, Math.round(f.swingT * 100)));
  // Animation flags: what the animator needs to pose a remote fighter.
  const anim = (f.heal ? 1 : 0) | (f.reloadT > 0 ? 2 : 0) | (f.fireFx > 0 ? 4 : 0) | (f.crouch ? 8 : 0)
    | (f.placeFx > 0 ? 16 : 0) | (f.hitFx > 0 ? 32 : 0) | (f.hitHead ? 64 : 0);
  w.u8(anim).u8(Math.round((f.hitDir / (Math.PI * 2)) * 255) & 255).u8(f.emote);
}

export function readRecord(r) {
  const id = r.u16(), flags = r.u8(), state = STATE_KEYS[r.u8()] || 'ground';
  const x = QUANT.unpos(r.i16()), y = QUANT.unpos(r.i16()), z = QUANT.unpos(r.i16());
  const vx = QUANT.unvel(r.i16()), vy = QUANT.unvel(r.i16()), vz = QUANT.unvel(r.i16());
  const yaw = QUANT.unyaw(r.u16()), pitch = QUANT.unpitch(r.i8());
  const hp = r.u8(), shield = r.u8(), selected = r.u8(), heldCode = r.u8(), heldRarity = r.u8();
  const swingT = r.u8() / 100;
  const anim = r.u8(), hitDir = (r.u8() / 255) * Math.PI * 2, emote = r.u8();
  return {
    id, alive: !!(flags & F.ALIVE), onGround: !!(flags & F.GROUND), swimming: !!(flags & F.SWIM),
    ads: !!(flags & F.ADS), scoped: !!(flags & F.SCOPED), buildMode: !!(flags & F.BUILD),
    editMode: !!(flags & F.EDIT), human: !!(flags & F.HUMAN),
    state, x, y, z, vx, vy, vz, yaw, pitch, hp, shield, selected, heldCode, heldRarity, swingT,
    healing: !!(anim & 1), reloading: !!(anim & 2), firing: !!(anim & 4), crouch: !!(anim & 8),
    placing: !!(anim & 16), hitReact: !!(anim & 32), hitHead: !!(anim & 64), hitDir, emote,
  };
}

// The item a remote fighter is visibly holding, as a minimal inventory entry.
export function heldItem(code, rarity) {
  if (code >= 1 && code <= WEAPON_KEYS.length) {
    const type = WEAPON_KEYS[code - 1];
    return { kind: 'weapon', type, rarity, mag: WEAPONS[type].mag };
  }
  if (code >= 20 && code < 20 + CONSUMABLE_KEYS.length) return { kind: 'consumable', type: CONSUMABLE_KEYS[code - 20], count: 1 };
  return null;
}

// ---------------------------------------------------------------- self block

function writeItem(w, it) {
  if (!it) { w.u8(0).u8(0).u8(0).u16(0); return; }
  if (it.kind === 'weapon') w.u8(1).u8(WEAPON_KEYS.indexOf(it.type)).u8(it.rarity).u16(it.mag);
  else w.u8(2).u8(CONSUMABLE_KEYS.indexOf(it.type)).u8(0).u16(it.count);
}

function readItem(r) {
  const kind = r.u8(), t = r.u8(), rarity = r.u8(), n = r.u16();
  if (kind === 1) return { kind: 'weapon', type: WEAPON_KEYS[t], rarity, mag: n };
  if (kind === 2) return { kind: 'consumable', type: CONSUMABLE_KEYS[t], count: n };
  return null;
}

// Private state only the owner needs: inventory, ammo, materials, timers.
export function writeSelf(w, f) {
  for (let i = 0; i < 5; i++) writeItem(w, f.slots[i]);
  for (const k of AMMO_KEYS) w.u16(f.ammo[k]);
  w.u16(f.mats.wood).u16(f.mats.brick).u16(f.mats.metal);
  w.u16(f.kills);
  w.f32(f.reloadT);
  w.f32(f.heal ? f.heal.t : 0).f32(f.heal ? f.heal.total : 0).u8(f.heal ? CONSUMABLE_KEYS.indexOf(f.heal.type) : 255).u8(f.heal ? f.heal.slot : 0);
  w.f32(f.chestT).f32(f.respawnT ?? -1);
  w.u8(f.eliminated ? 1 : 0).u8(f.placement || 0);
  w.u8(['wall', 'floor', 'ramp', 'cone'].indexOf(f.buildPiece)).u8(['wood', 'brick', 'metal'].indexOf(f.buildMat));
  w.u32(f.editing ? f.editing.piece.id : 0);
  let mask = 0;
  if (f.editing) for (const i of f.editing.selected) mask |= 1 << i;
  w.u16(mask);
  w.f32(f.fireCd).f32(f.bloom);
}

export function readSelf(r) {
  const slots = [];
  for (let i = 0; i < 5; i++) slots.push(readItem(r));
  const ammo = {};
  for (const k of AMMO_KEYS) ammo[k] = r.u16();
  const mats = { wood: r.u16(), brick: r.u16(), metal: r.u16() };
  const kills = r.u16();
  const reloadT = r.f32();
  const healT = r.f32(), healTotal = r.f32(), healType = r.u8(), healSlot = r.u8();
  const chestT = r.f32(), respawnT = r.f32();
  const eliminated = !!r.u8(), placement = r.u8();
  const buildPiece = ['wall', 'floor', 'ramp', 'cone'][r.u8()] || 'wall';
  const buildMat = ['wood', 'brick', 'metal'][r.u8()] || 'wood';
  const editPiece = r.u32(), editMask = r.u16();
  const fireCd = r.f32(), bloom = r.f32();
  return {
    slots, ammo, mats, kills, reloadT,
    heal: healType === 255 ? null : { t: healT, total: healTotal, type: CONSUMABLE_KEYS[healType], slot: healSlot },
    chestT, respawnT: respawnT < 0 ? undefined : respawnT, eliminated, placement, buildPiece, buildMat,
    editPiece, editMask, fireCd, bloom,
  };
}

// ---------------------------------------------------------------- snapshot

// info: {tick, ackSeq, match, selfFighter|null, updated:[fighter], removed:[id]}
export function encodeSnapshot(info) {
  const { tick, ackSeq, match, self, updated, removed } = info;
  const w = new Writer(512);
  w.u8(MSG.SNAPSHOT).u32(tick).u32(ackSeq);
  w.u8(Math.max(0, PHASE_KEYS.indexOf(match.phase))).u8(match.resurgence ? 1 : 0).u16(match.aliveCount());
  const s = match.storm;
  w.f32(s.center.x).f32(s.center.y).f32(s.radius).f32(s.next.c.x).f32(s.next.c.y).f32(s.next.r);
  w.u8(Math.max(0, STORM_MODES.indexOf(s.mode))).i8(s.phase).f32(s.timer);
  w.f32(match.bus ? match.bus.t : 0);
  w.f32(match.time);
  w.u8(self ? 1 : 0);
  if (self) { writeRecord(w, self); writeSelf(w, self); }
  w.u8(removed.length);
  for (const id of removed) w.u16(id);
  w.u16(updated.length);
  for (const f of updated) writeRecord(w, f);
  return w.bytes();
}

export function decodeSnapshot(data) {
  const r = new Reader(data);
  if (r.u8() !== MSG.SNAPSHOT) throw new Error('not a snapshot');
  const snap = { tick: r.u32(), ackSeq: r.u32() };
  snap.phase = PHASE_KEYS[r.u8()] || 'init';
  snap.resurgence = !!r.u8();
  snap.alive = r.u16();
  snap.storm = {
    cx: r.f32(), cz: r.f32(), radius: r.f32(), ncx: r.f32(), ncz: r.f32(), nr: r.f32(),
    mode: STORM_MODES[r.u8()] || 'idle', phase: r.i8(), timer: r.f32(),
  };
  snap.busT = r.f32();
  snap.time = r.f32();
  if (r.u8()) { snap.self = readRecord(r); snap.selfPrivate = readSelf(r); }
  const nRemoved = r.u8();
  snap.removed = [];
  for (let i = 0; i < nRemoved; i++) snap.removed.push(r.u16());
  const n = r.u16();
  snap.fighters = [];
  for (let i = 0; i < n; i++) snap.fighters.push(readRecord(r));
  return snap;
}

// Cheap equality for delta encoding: encode a record and compare bytes.
export function recordBytes(f) {
  const w = new Writer(48);
  writeRecord(w, f);
  return w.bytes();
}

export function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
