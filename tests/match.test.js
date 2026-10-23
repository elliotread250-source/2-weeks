import test from 'node:test';
import assert from 'node:assert/strict';
import { Match } from '../shared/sim/match.js';
import { sha } from './helpers.js';

function run(seed, ticks) {
  const m = new Match({ seed, botCount: 24 });
  m.addBots();
  m.start();
  for (let i = 0; i < ticks && m.phase !== 'over'; i++) { m.tick(); m.takeEvents(); }
  return m;
}

test('a full bot match runs for minutes without throwing', () => {
  const m = run(21, 30 * 60 * 4);
  assert.ok(m.time > 200);
  assert.ok(m.fighters.some((f) => f.kills > 0), 'bots fight each other');
  assert.ok(['play', 'over'].includes(m.phase));
});

test('the same seed plays out identically', () => {
  const snap = (m) => sha(m.fighters.map((f) => [f.name, f.state, f.alive, f.kills, Math.round(f.pos.x * 100), Math.round(f.pos.z * 100), Math.round(f.hp)]));
  assert.equal(snap(run(8, 2000)), snap(run(8, 2000)));
});

test('the storm shrinks through its phases', () => {
  const m = run(4, 30 * 60 * 5);
  assert.ok(m.storm.phase >= 2);
  assert.ok(m.storm.radius < 300);
});

test('Resurgence turns off and eliminations become permanent', () => {
  const m = run(12, 30 * 60 * 8);
  assert.equal(m.resurgence, false);
  assert.ok(m.fighters.some((f) => f.eliminated));
});

test('a human with no input is left standing and survives the bus ride', () => {
  const m = new Match({ seed: 2, botCount: 5 });
  const h = m.addHuman('tester');
  m.addBots(5);
  m.start();
  for (let i = 0; i < 30 * 40; i++) { m.tick(); m.takeEvents(); }
  assert.equal(h.state === 'bus', false, 'bus doors force a jump');
});
