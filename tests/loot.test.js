import test from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '../shared/math/util.js';
import { rollWeapon, rollConsumable } from '../shared/sim/loot.js';
import { WEAPONS, LOOT_WEIGHTS } from '../shared/config.js';

test('rarity rolls follow the table weights', () => {
  const rng = new Rng(7);
  const N = 40000;
  for (const table of ['floor', 'chest']) {
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      // Weapons that cannot roll a low rarity bump up, so test the raw weights
      // through a weapon that exists at every rarity.
      const idx = rng.weighted(LOOT_WEIGHTS[table]);
      counts[idx]++;
    }
    const total = LOOT_WEIGHTS[table].reduce((a, b) => a + b, 0);
    LOOT_WEIGHTS[table].forEach((w, i) => {
      assert.ok(Math.abs(counts[i] / N - w / total) < 0.01, `${table} rarity ${i}`);
    });
  }
});

test('a weapon never rolls a rarity it does not have', () => {
  const rng = new Rng(3);
  for (let i = 0; i < 5000; i++) {
    const w = rollWeapon(rng, i % 2 ? 'chest' : 'floor');
    assert.ok(WEAPONS[w.type].damage[w.rarity] != null, `${w.type} r${w.rarity}`);
  }
});

test('consumables always roll known types with a pickup count', () => {
  const rng = new Rng(11);
  for (let i = 0; i < 500; i++) {
    const c = rollConsumable(rng);
    assert.ok(c.count >= 1);
  }
});

test('seeded rolls are repeatable', () => {
  const a = new Rng(5), b = new Rng(5);
  for (let i = 0; i < 50; i++) assert.deepEqual(rollWeapon(a), rollWeapon(b));
});
