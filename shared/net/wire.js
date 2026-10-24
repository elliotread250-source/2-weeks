// Turns sim events into JSON for the network and back. Events carry object
// references inside the sim (a build piece, a map chunk); on the wire they
// become ids, and the client's replica match resolves them again.
import { Vec3 } from '../math/vec3.js';
import { keyOf } from '../sim/building.js';

// ---------------------------------------------------------------- serialise

export function pieceToWire(p) {
  return {
    id: p.id, type: p.type, gx: p.gx, gz: p.gz, baseY: p.baseY, axis: p.axis, dir: p.dir, mat: p.mat,
    owner: p.owner ? p.owner.id : null, hp: p.hp, maxHp: p.maxHp, built: p.built, edits: [...p.edits],
  };
}

export function pickupToWire(pk) {
  return {
    id: pk.id, item: pk.item, x: pk.pos.x, y: pk.pos.y, z: pk.pos.z, settled: pk.settled, phase: pk.phase,
  };
}

const POSITIONAL = new Set(['muzzle', 'tracer', 'burst', 'harvestHit', 'buildDamaged', 'explosion', 'eliminated', 'projSpawn', 'projEnd']);
const EVERYONE = new Set([
  'staticBroken', 'staticDamaged', 'harvestBroken', 'buildPlaced', 'buildChanged', 'buildDestroyed',
  'buildComplete', 'buildCollapsing', 'pickupSpawned', 'pickupRemoved', 'chestOpened', 'chestMoved',
  'feed', 'matchStart', 'matchOver', 'supplyDrop', 'supplyLanded',
]);
const TARGETED_BY = new Set(['kick', 'matGain', 'damageNumber']);

// Returns {wire, to, at} or null: `to` is a fighter id (only that client gets
// it), `at` a position for interest filtering, neither means everyone.
export function serializeEvent(ev, match) {
  const t = ev.type;
  const out = { t };
  switch (t) {
    case 'staticDamaged': out.el = ev.el.id; out.factor = ev.factor; break;
    case 'staticBroken': out.el = ev.el.id; out.mode = ev.mode; break;
    case 'harvestHit': out.h = ev.h.id; out.at = [ev.h.center.x, ev.h.center.y, ev.h.center.z]; break;
    case 'harvestBroken': out.h = ev.h.id; break;
    case 'buildPlaced': out.p = pieceToWire(ev.p); break;
    case 'buildChanged': out.p = pieceToWire(ev.p); break;
    case 'buildDamaged': out.id = ev.p.id; out.hp = ev.p.hp; break;
    case 'buildComplete': out.id = ev.p.id; break;
    case 'buildCollapsing': out.id = ev.p.id; break;
    case 'buildDestroyed': out.id = ev.p.id; out.mode = ev.mode; break;
    case 'pickupSpawned': out.pk = pickupToWire(ev.pk); break;
    case 'pickupRemoved': out.id = ev.pk.id; break;
    case 'chestOpened': out.id = ev.c.id; break;
    case 'chestMoved': out.id = ev.c.id; out.y = ev.c.pos.y; break;
    case 'supplyDrop': out.c = { id: ev.c.id, x: ev.c.pos.x, y: ev.c.pos.y, z: ev.c.pos.z, rot: ev.c.rot, landY: ev.c.landY }; break;
    case 'matchStart': {
      const b = match.bus;
      out.bus = { start: { x: b.start.x, y: b.start.y, z: b.start.z }, end: { x: b.end.x, y: b.end.y, z: b.end.z }, dir: { x: b.dir.x, y: b.dir.y, z: b.dir.z }, duration: b.duration };
      break;
    }
    default: Object.assign(out, ev); delete out.type;
  }
  let to = null, at = null;
  if (EVERYONE.has(t)) { /* broadcast */ }
  else if (TARGETED_BY.has(t)) to = ev.by;
  else if (t === 'hit') { out.__both = [ev.by, ev.target]; }
  else if (t === 'message') to = ev.to;
  else if (t === 'jumped' || t === 'landed' || t === 'respawned' || t === 'placement') to = ev.id;
  else if (t === 'spectate') to = ev.id;
  else if (t === 'sfx') {
    if (ev.own) to = ev.by;
    else if (ev.pos) at = ev.pos;
  } else if (POSITIONAL.has(t)) {
    const p = ev.pos || ev.from || (out.at && { x: out.at[0], y: out.at[1], z: out.at[2] }) || (ev.h && ev.h.center) || (ev.p && ev.p.gx !== undefined && { x: ev.p.gx * 5, y: ev.p.baseY, z: ev.p.gz * 5 });
    if (p) at = p;
  }
  return { wire: out, to: to === undefined ? null : to, at };
}

// ---------------------------------------------------------------- welcome

// Everything a joining (or reconnecting) client needs on top of the seed.
export function buildWelcome(match, selfId) {
  return {
    t: 'welcome',
    seed: match.seed,
    self: selfId,
    tick: match.tickCount,
    fighters: match.fighters.map((f) => ({ id: f.id, name: f.name, loadout: f.loadout, human: f.human })),
    builds: match.builds.list.map(pieceToWire),
    pickups: match.loot.pickups.map(pickupToWire),
    chestsOpen: match.loot.chests.filter((c) => c.opened).map((c) => c.id),
    chestY: match.loot.chests.filter((c) => c.moved).map((c) => [c.id, c.pos.y]),
    supply: match.loot.chests.filter((c) => c.type === 'supply').map((c) => ({ id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, rot: c.rot, landY: c.landY, opened: c.opened, falling: c.falling })),
    deadStatics: match.world.elements.filter((e) => e.dead).map((e) => e.id),
    hpStatics: match.world.elements.filter((e) => !e.dead && e.hp < e.maxHp).map((e) => [e.id, e.hp]),
    harvest: match.world.harvestables.filter((h) => h.dead || h.hp < h.maxHp).map((h) => [h.id, h.hp, h.dead ? 1 : 0]),
    phase: match.phase,
    bus: match.bus ? { start: match.bus.start, end: match.bus.end, dir: match.bus.dir, duration: match.bus.duration } : null,
  };
}

// ---------------------------------------------------------------- apply (client)

function pieceFromWire(match, d) {
  const owner = match.fighters.find((f) => f.id === d.owner) || null;
  const p = {
    id: d.id, type: d.type, gx: d.gx, gz: d.gz, baseY: d.baseY, axis: d.axis, dir: d.dir, mat: d.mat,
    owner, hp: d.hp, maxHp: d.maxHp, built: d.built, edits: new Set(d.edits), colliders: [],
  };
  p.key = keyOf(p);
  return p;
}

export function addRemotePiece(match, d) {
  const b = match.builds;
  const old = b.list.find((q) => q.id === d.id);
  if (old) b.destroy(old, 'quiet');
  const p = pieceFromWire(match, d);
  // The server's piece replaces the one we predicted at the same spot.
  const guess = b.list.find((q) => q.predicted && q.key === p.key);
  if (guess) { b.destroy(guess, 'quiet'); match.pushEvent('buildDestroyed', { p: guess, mode: 'quiet' }); }
  b.pieces.set(p.key, p);
  b.list.push(p);
  b.rebuild(p);
  return p;
}

// Load a welcome into a fresh replica match. Pushes the events the views need
// to build their scene from nothing.
export function applyWelcome(match, w) {
  match.tickCount = w.tick;
  const world = match.world;
  for (const id of w.deadStatics) {
    const el = world.elements[id];
    if (el) { world.destroyStatic(el, 'init'); match.pushEvent('staticBroken', { el, mode: 'init' }); }
  }
  for (const [id, hp] of w.hpStatics) { const el = world.elements[id]; if (el) el.hp = hp; }
  for (const [id, hp, dead] of w.harvest) {
    const h = world.harvestables[id];
    if (!h) continue;
    h.hp = hp;
    if (dead) { world.destroyHarvestable(h); match.pushEvent('harvestBroken', { h }); }
  }
  const loot = match.loot;
  for (const c of loot.chests) match.pushEvent('chestPlaced', { c });
  for (const id of w.chestsOpen) {
    const c = loot.chests.find((q) => q.id === id);
    if (c) { c.opened = true; match.pushEvent('chestOpened', { c }); }
  }
  for (const [id, y] of w.chestY) {
    const c = loot.chests.find((q) => q.id === id);
    if (c) { c.pos.y = y; match.pushEvent('chestMoved', { c }); }
  }
  loot.pickups.length = 0; // the seed's initial pickups are replaced by the live set
  for (const d of w.pickups) {
    const pk = { id: d.id, item: d.item, pos: new Vec3(d.x, d.y, d.z), vel: new Vec3(), settled: d.settled, age: 9, phase: d.phase };
    loot.pickups.push(pk);
    match.pushEvent('pickupSpawned', { pk });
  }
  for (const d of w.builds) {
    const p = addRemotePiece(match, d);
    match.pushEvent('buildPlaced', { p });
    if (p.built) match.pushEvent('buildComplete', { p });
  }
  if (w.bus) setBus(match, w.bus);
}

export function setBus(match, b) {
  const start = new Vec3(b.start.x, b.start.y, b.start.z), end = new Vec3(b.end.x, b.end.y, b.end.z);
  match.bus = { start, end, dir: new Vec3(b.dir.x, b.dir.y, b.dir.z), pos: start.clone(), t: 0, duration: b.duration, timeLeft: b.duration };
}

// Apply one server event to the replica and queue the matching local event.
function addRemoteSupply(match, d) {
  const c = { id: d.id, type: 'supply', pos: new Vec3(d.x, d.y, d.z), rot: d.rot, opened: !!d.opened, falling: d.falling !== false && d.y > d.landY + 0.01, landY: d.landY, sync: 0 };
  match.loot.chests.push(c);
  return c;
}

export function applyWireEvent(match, w) {
  const world = match.world;
  const byId = (id) => match.fighters.find((f) => f.id === id);
  switch (w.t) {
    case 'staticDamaged': { const el = world.elements[w.el]; if (el) { el.hp = Math.round(el.maxHp * Math.max(0, (w.factor - 0.45) / 0.55)); match.pushEvent('staticDamaged', { el, factor: w.factor }); } break; }
    case 'staticBroken': {
      const el = world.elements[w.el];
      if (el && !el.dead) { world.destroyStatic(el, w.mode); match.pushEvent('staticBroken', { el, mode: w.mode }); }
      break;
    }
    case 'harvestHit': { const h = world.harvestables[w.h]; if (h) match.pushEvent('harvestHit', { h }); break; }
    case 'harvestBroken': {
      const h = world.harvestables[w.h];
      if (h && !h.dead) { world.destroyHarvestable(h); match.pushEvent('harvestBroken', { h }); }
      break;
    }
    case 'buildPlaced': { const p = addRemotePiece(match, w.p); match.pushEvent('buildPlaced', { p }); if (p.built) match.pushEvent('buildComplete', { p }); break; }
    case 'buildChanged': {
      const p = match.builds.list.find((q) => q.id === w.p.id);
      if (p) { p.edits = new Set(w.p.edits); p.dir = w.p.dir; match.builds.rebuild(p); match.pushEvent('buildChanged', { p }); }
      break;
    }
    case 'buildDamaged': { const p = match.builds.list.find((q) => q.id === w.id); if (p) { p.hp = w.hp; match.pushEvent('buildDamaged', { p }); } break; }
    case 'buildComplete': { const p = match.builds.list.find((q) => q.id === w.id); if (p) { p.built = true; p.hp = p.maxHp; match.pushEvent('buildComplete', { p }); } break; }
    case 'buildCollapsing': { const p = match.builds.list.find((q) => q.id === w.id); if (p) { p.collapsing = true; match.pushEvent('buildCollapsing', { p }); } break; }
    case 'buildDestroyed': {
      const p = match.builds.list.find((q) => q.id === w.id);
      if (p) { match.builds.destroy(p, w.mode); match.pushEvent('buildDestroyed', { p, mode: w.mode }); }
      break;
    }
    case 'pickupSpawned': {
      const d = w.pk;
      const pk = { id: d.id, item: d.item, pos: new Vec3(d.x, d.y, d.z), vel: new Vec3(), settled: d.settled, age: 0, phase: d.phase };
      match.loot.pickups.push(pk);
      match.pushEvent('pickupSpawned', { pk });
      break;
    }
    case 'pickupRemoved': {
      const i = match.loot.pickups.findIndex((q) => q.id === w.id);
      if (i >= 0) { const [pk] = match.loot.pickups.splice(i, 1); match.pushEvent('pickupRemoved', { pk }); }
      break;
    }
    case 'chestOpened': { const c = match.loot.chests.find((q) => q.id === w.id); if (c && !c.opened) { c.opened = true; match.pushEvent('chestOpened', { c }); } break; }
    case 'chestMoved': { const c = match.loot.chests.find((q) => q.id === w.id); if (c) { c.pos.y = w.y; match.pushEvent('chestMoved', { c }); } break; }
    case 'supplyDrop': { const c = addRemoteSupply(match, w.c); match.pushEvent('supplyDrop', { c }); break; }
    case 'matchStart': setBus(match, w.bus); match.pushEvent('matchStart', {}); break;
    case 'spectate': match.pushEvent('spectate', { id: w.id, killer: w.killer }); break;
    default: {
      const { t, ...rest } = w;
      delete rest.__both;
      match.pushEvent(t, rest);
      void byId;
    }
  }
}
