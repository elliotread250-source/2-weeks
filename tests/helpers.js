// Shared builders for the tests: a bare combat harness with no map, and a
// digest helper for determinism checks.
import crypto from 'node:crypto';
import { Rng } from '../shared/math/util.js';
import { CollisionWorld } from '../shared/sim/collision.js';
import { terrainHeight } from '../shared/sim/terrain.js';
import { World } from '../shared/sim/world.js';
import { BuildSystem } from '../shared/sim/building.js';
import { Combat } from '../shared/sim/combat.js';
import { Fighter } from '../shared/sim/fighter.js';
import { Vec3 } from '../shared/math/vec3.js';

// A fake match with just enough for Combat and BuildSystem: flat ground at
// y=0 (uses real terrain heights, so tests pick a spot well above water).
export function harness(seed = 1) {
  const rng = new Rng(seed);
  const events = [];
  const m = {
    rng, events, time: 0, phase: 'play', fighters: [],
    emit: (type, data) => events.push({ type, ...data }),
    eliminated: [],
    eliminate(target, source, weapon) { target.alive = false; this.eliminated.push({ target, source, weapon }); },
  };
  m.collision = new CollisionWorld(terrainHeight);
  m.builds = new BuildSystem(m.collision, rng, m.emit);
  m.world = { harvestables: [], damageStatic() {} };
  m.loot = { nearestChest: () => null, nearestPickup: () => null };
  m.combat = new Combat(m);
  return m;
}

export function spawn(m, x, z, opts = {}) {
  const f = new Fighter(opts.name || 'f', {}, { human: !!opts.human });
  f.pos.set(x, terrainHeight(x, z), z);
  f.state = 'ground';
  f.onGround = true;
  m.fighters.push(f);
  return f;
}

export const sha = (data) => crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex');

export function worldDigest(seed) {
  const col = new CollisionWorld(terrainHeight);
  const w = new World(col, seed === undefined ? {} : { seed }).build();
  return sha([w.prims, w.lootSpots, w.harvestables.map((h) => ({ ...h, collider: undefined })), w.signs,
    w.elements.map((e) => ({ id: e.id, hp: e.hp, min: e.min, max: e.max }))]);
}

export { Vec3 };
