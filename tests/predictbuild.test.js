import test from 'node:test';
import assert from 'node:assert/strict';
import { NetHost } from '../public/js/client/nethost.js';
import { Match } from '../shared/sim/match.js';
import { Fighter } from '../shared/sim/fighter.js';
import { applyWireEvent } from '../shared/net/wire.js';
import { emptyCommand, HELD } from '../shared/sim/controller.js';

function fake() {
  const match = new Match({ seed: 4, botCount: 0, replica: true });
  const f = new Fighter('me', {}, { human: true });
  match.fighters.push(f);
  f.state = 'ground'; f.onGround = true; f.buildMode = true;
  f.pos.set(-60, match.collision.terrainHeight(-60, 60), 60);
  f.mats.wood = 50;
  return { match, local: f, predictedId: 0, nextBuildAt: 0, now: () => performance.now() / 1000 };
}

test('a predicted piece shows at once, costs materials, and is replaced by the server copy', () => {
  const h = fake();
  const cmd = { ...emptyCommand(), held: HELD.FIRE, yaw: 0, pitch: 0 };
  NetHost.prototype.predictBuild.call(h, cmd);
  assert.equal(h.match.builds.list.length, 1);
  assert.equal(h.match.builds.list[0].predicted, true);
  assert.equal(h.local.mats.wood, 40);
  const guess = h.match.builds.list[0];
  const events = h.match.takeEvents();
  assert.ok(events.some((e) => e.type === 'buildPlaced'));

  // The server confirms the same spot with a real id.
  applyWireEvent(h.match, {
    t: 'buildPlaced',
    p: { id: 77, type: guess.type, gx: guess.gx, gz: guess.gz, baseY: guess.baseY, axis: guess.axis, dir: guess.dir, mat: 'wood', owner: h.local.id, hp: 90, maxHp: 150, built: false, edits: [] },
  });
  assert.equal(h.match.builds.list.length, 1);
  assert.equal(h.match.builds.list[0].id, 77);
  const evs = h.match.takeEvents();
  assert.ok(evs.some((e) => e.type === 'buildDestroyed' && e.mode === 'quiet'));
});

test('no prediction without materials or outside build mode', () => {
  const h = fake();
  h.local.mats.wood = 5;
  NetHost.prototype.predictBuild.call(h, { ...emptyCommand(), held: HELD.FIRE });
  assert.equal(h.match.builds.list.length, 0);
  h.local.mats.wood = 50;
  h.local.buildMode = false;
  NetHost.prototype.predictBuild.call(h, { ...emptyCommand(), held: HELD.FIRE });
  assert.equal(h.match.builds.list.length, 0);
});
