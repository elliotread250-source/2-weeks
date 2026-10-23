import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, spawn } from './helpers.js';
import { GRID, pieceBoxes } from '../shared/sim/building.js';
import { MATERIALS, BUILD_COST } from '../shared/config.js';
import { ACT, HELD, applyCommand, emptyCommand } from '../shared/sim/controller.js';

// A flat spot on the island, far from any POI building.
const X = -60, Z = 60;

function place(m, f, type, mat = 'wood', yaw = 0, pitch = 0) {
  const t = m.builds.computeTarget(type, f.pos, yaw, pitch);
  return m.builds.place(t, mat, f);
}

test('pieces start weak and grow to full health over the build time', () => {
  const m = harness();
  const f = spawn(m, X, Z);
  const p = place(m, f, 'wall');
  assert.ok(p);
  assert.equal(p.hp, MATERIALS.wood.wall[0]);
  m.builds.update(MATERIALS.wood.time + 0.1);
  assert.equal(p.built, true);
  assert.equal(p.hp, MATERIALS.wood.wall[1]);
});

test('health values follow the Fortnite wiki figures per material', () => {
  assert.deepEqual(MATERIALS.brick.wall, [90, 300]);
  assert.deepEqual(MATERIALS.metal.wall, [110, 500]);
  assert.deepEqual(MATERIALS.wood.wall, [90, 150]);
});

test('a piece cannot float: it needs ground or a neighbour', () => {
  const m = harness();
  const f = spawn(m, X, Z);
  const high = m.builds.computeTarget('wall', f.pos, 0, 0);
  high.baseY += 40;
  assert.equal(m.builds.canPlace(high), false);
});

test('destroying the support collapses a floor that rested on it', () => {
  const m = harness();
  const f = spawn(m, X, Z);
  const wall = place(m, f, 'wall');
  assert.ok(wall);
  const floor = m.builds.place({
    type: 'floor', gx: wall.gx, gz: wall.gz, baseY: wall.baseY + 3.75, key: `F:${wall.gx},${wall.gz},${Math.round((wall.baseY + 3.75) * 10)}`,
  }, 'wood', f);
  assert.ok(floor, 'a floor can rest on the top of a wall');
  m.builds.destroy(wall, 'smash');
  m.builds.collapseUnsupported(wall);
  assert.equal(floor.collapsing, true);
  m.builds.update(5); // let the delayed collapse fire
  assert.equal(floor.dead, true);
  assert.equal(m.builds.list.length, 0);
});

test('wall edits remove tiles from the collider set', () => {
  const m = harness();
  const f = spawn(m, X, Z);
  const p = place(m, f, 'wall');
  const full = pieceBoxes(p).length;
  assert.equal(full, 9);
  m.builds.startEdit(f, p);
  m.builds.toggleTile(f, 4, false);
  m.builds.toggleTile(f, 1, false);
  m.builds.confirmEdit(f);
  assert.equal(pieceBoxes(p).length, 7);
});

test('you cannot edit away every tile of a piece', () => {
  const m = harness();
  const f = spawn(m, X, Z);
  const p = place(m, f, 'floor');
  m.builds.startEdit(f, p);
  for (let i = 0; i < GRID.floor[0] * GRID.floor[1]; i++) m.builds.toggleTile(f, i, false);
  m.builds.confirmEdit(f);
  assert.equal(p.edits.size, 0);
});

test('ramp edits change its direction', () => {
  const m = harness();
  const f = spawn(m, X, Z);
  const p = place(m, f, 'ramp');
  const before = p.dir;
  m.builds.startEdit(f, p);
  m.builds.toggleTile(f, 0, false);
  m.builds.toggleTile(f, 1, true);
  m.builds.confirmEdit(f);
  assert.equal(p.dir, 0); // dragging left to right points the ramp +x
  assert.ok(before !== undefined);
});

test('building through a command costs materials and respects the cost', () => {
  const m = harness();
  m.phase = 'play';
  m.jumpFromBus = () => {};
  const f = spawn(m, X, Z, { human: true });
  f.mats.wood = BUILD_COST;
  const base = emptyCommand();
  applyCommand(m, f, { ...base, act: ACT.BUILD }, 1 / 30);
  assert.equal(f.buildMode, true);
  applyCommand(m, f, { ...base, held: HELD.FIRE, act: ACT.FIRE }, 1 / 30);
  assert.equal(f.mats.wood, 0);
  assert.equal(m.builds.list.length, 1);
  f.buildCd = 0;
  applyCommand(m, f, { ...base, held: HELD.FIRE }, 1 / 30);
  assert.equal(m.builds.list.length, 1, 'no second piece without materials');
});
