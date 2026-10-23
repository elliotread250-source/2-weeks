import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/sim/match.js';
import { Vec3 } from '../shared/math/vec3.js';
import { WEAPONS } from '../shared/config.js';

function setup() {
  const m = new Match({ seed: 5, botCount: 0, keepHistory: true });
  const shooter = m.addHuman('shooter');
  const target = m.addHuman('target');
  for (const f of [shooter, target]) { f.state = 'ground'; f.onGround = true; f.slots = [null, null, null, null, null]; }
  m.phase = 'play';
  shooter.slots[0] = { kind: 'weapon', type: 'ar', rarity: 3, mag: 30 };
  shooter.selected = 1;
  shooter.ammo.medium = 90;
  shooter.pos.set(-60, 0, 60); shooter.pos.y = m.collision.terrainHeight(-60, 60);
  return { m, shooter, target };
}

test('rewinding to the shooter\'s view time hits a target that has since moved', () => {
  const { m, shooter, target } = setup();
  // Target stands at x=-56 for 10 ticks, then steps 3 m sideways.
  target.pos.set(-56, 0, 30); target.pos.y = m.collision.terrainHeight(-56, 30);
  for (let i = 0; i < 10; i++) { m.recordHistory(); m.tickCount++; }
  const viewTick = m.tickCount - 1;
  target.pos.x = -53;
  m.recordHistory(); m.tickCount++;

  const eye = new Vec3(shooter.pos.x, shooter.pos.y + 1.7, shooter.pos.z);
  const aim = new Vec3(-56 - eye.x, target.pos.y + 1 - eye.y, 30 - eye.z).normalize();
  m.rng.random = () => 0.5;

  shooter.bloom = 0;
  m.combat.fire(shooter, eye, aim, { ads: true, firstShotAccurate: true });
  assert.equal(target.hp, 100, 'without rewind the shot misses where the target used to be');

  shooter.fireCd = 0;
  m.combat.fire(shooter, eye, aim, { ads: true, firstShotAccurate: true, rewindTick: viewTick });
  assert.ok(target.shield + target.hp < 200, 'with rewind it lands');
  assert.ok(WEAPONS.ar.damage[3] > 0);
});

test('history only remembers about a second', () => {
  const { m } = setup();
  for (let i = 0; i < 100; i++) { m.recordHistory(); m.tickCount++; }
  assert.equal(m.history.length, 30);
});
