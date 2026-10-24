import test from 'node:test';
import assert from 'node:assert/strict';
import { worldDigest } from './helpers.js';
import { POIS, biomeAt } from '../shared/sim/terrain.js';
import { Match } from '../shared/sim/match.js';

test('same seed builds a byte-identical island', () => {
  assert.equal(worldDigest(), worldDigest());
  assert.equal(worldDigest(99), worldDigest(99));
});

test('a different seed changes the layout', () => {
  assert.notEqual(worldDigest(1), worldDigest(2));
});

test('the island has the expected scale of content', () => {
  const m = new Match({ seed: 5, botCount: 0 });
  assert.ok(m.world.prims.length > 4000);
  assert.ok(m.world.harvestables.length > 700);
  assert.ok(m.world.lootSpots.length > 150);
  assert.ok(m.world.signs.length >= 10 && m.world.signs.length <= POIS.length);
});

test('the island has 17 places, four biomes, and every place is on dry land in the right biome', () => {
  assert.equal(POIS.length, 17);
  const seen = new Set(POIS.map((p) => biomeAt(p.x, p.z)));
  for (const b of ['temperate', 'snow', 'desert', 'jungle']) assert.ok(seen.has(b), `no place in ${b}`);
  for (const p of POIS) {
    assert.equal(biomeAt(p.x, p.z) === 'snow' || biomeAt(p.x, p.z) === 'desert' || biomeAt(p.x, p.z) === 'jungle' || biomeAt(p.x, p.z) === 'temperate', true);
    if (p.biome) assert.equal(biomeAt(p.x, p.z), p.biome, `${p.id} should sit in ${p.biome}`);
  }
});
