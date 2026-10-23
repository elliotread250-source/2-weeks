import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, spawn, Vec3 } from './helpers.js';
import { WEAPONS } from '../shared/config.js';

function shooter(m, type, rarity = 2) {
  const s = spawn(m, -60, 60, { name: 'shooter' });
  s.slots[0] = { kind: 'weapon', type, rarity, mag: WEAPONS[type].mag };
  s.selected = 1;
  s.ammo[WEAPONS[type].ammo] = 100;
  return s;
}

test('shield absorbs damage before health', () => {
  const m = harness();
  const t = spawn(m, 0, 0);
  m.combat.applyDamage(t, 60, null, {});
  assert.equal(t.shield, 40);
  assert.equal(t.hp, 100);
  m.combat.applyDamage(t, 60, null, {});
  assert.equal(t.shield, 0);
  assert.equal(t.hp, 80);
});

test('storm damage skips the shield', () => {
  const m = harness();
  const t = spawn(m, 0, 0);
  m.combat.applyDamage(t, 10, null, { storm: true });
  assert.equal(t.shield, 100);
  assert.equal(t.hp, 90);
});

test('lethal damage eliminates exactly once', () => {
  const m = harness();
  const t = spawn(m, 0, 0);
  t.shield = 0;
  m.combat.applyDamage(t, 500, null, { weapon: 'test' });
  m.combat.applyDamage(t, 500, null, { weapon: 'test' });
  assert.equal(m.eliminated.length, 1);
  assert.equal(t.hp, 0);
});

test('headshots multiply damage by the weapon multiplier', () => {
  const m = harness();
  const s = shooter(m, 'ar');
  const t = spawn(m, -60, 40, { name: 'target' });
  t.shield = 0;
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  // Aim at the head box (1.48 to 1.98 above the feet), then the body.
  const head = new Vec3(0, t.pos.y + 1.75 - eye.y, -20).normalize();
  m.rng.random = () => 0.5; // deterministic spread is irrelevant at ads+firstShot
  s.bloom = 0;
  m.combat.fire(s, eye, head, { ads: true, firstShotAccurate: true });
  const spec = WEAPONS.ar;
  assert.ok(Math.abs((100 - t.hp) - spec.damage[2] * spec.headMult) < 0.001, `head dmg ${100 - t.hp}`);
});

test('shotgun damage falls off with distance, never below the floor', () => {
  const m = harness();
  const s = shooter(m, 'pump', 4);
  const near = spawn(m, -60, 55, { name: 'near' });
  near.shield = 0;
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  m.combat.fire(s, eye, new Vec3(0, near.pos.y + 1 - eye.y, -5).normalize(), { ads: true });
  const nearDmg = 100 - near.hp;
  m.fighters.pop();
  const far = spawn(m, -60, 30, { name: 'far' });
  far.shield = 0;
  s.fireCd = 0; s.slots[0].mag = 5;
  m.combat.fire(s, eye, new Vec3(0, far.pos.y + 1 - eye.y, -30).normalize(), { ads: true });
  const farDmg = 100 - far.hp;
  assert.ok(nearDmg > farDmg, `${nearDmg} should beat ${farDmg}`);
  assert.ok(farDmg >= 0);
});

test('firing consumes magazine ammo and reload refills from reserve', () => {
  const m = harness();
  const s = shooter(m, 'smg');
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  m.combat.fire(s, eye, new Vec3(0, 0, -1), { ads: true });
  assert.equal(s.slots[0].mag, WEAPONS.smg.mag - 1);
  assert.equal(m.combat.tryReload(s), true);
  m.combat.update(WEAPONS.smg.reload[2] + 0.1);
  assert.equal(s.slots[0].mag, WEAPONS.smg.mag);
  assert.equal(s.ammo.light, 99);
});

test('weapons respect their fire rate', () => {
  const m = harness();
  const s = shooter(m, 'pistol');
  const eye = new Vec3(s.pos.x, s.pos.y + 1.7, s.pos.z);
  assert.equal(m.combat.fire(s, eye, new Vec3(0, 0, -1)), true);
  assert.equal(m.combat.fire(s, eye, new Vec3(0, 0, -1)), false);
});
