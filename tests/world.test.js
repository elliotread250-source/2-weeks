import test from 'node:test';
import assert from 'node:assert/strict';
import { worldDigest } from './helpers.js';
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
  assert.ok(m.world.harvestables.length > 300);
  assert.ok(m.world.lootSpots.length > 100);
  assert.equal(m.world.signs.length, 10);
});
