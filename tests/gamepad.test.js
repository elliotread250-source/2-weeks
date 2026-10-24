import test from 'node:test';
import assert from 'node:assert/strict';
import { stick, readPad, lookRate, PAD_BUTTONS, DEADZONE } from '../public/js/client/gamepad.js';

const pad = (pressed = [], axes = [0, 0, 0, 0]) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })),
  axes,
});

test('stick drift inside the deadzone does nothing and full deflection reaches 1', () => {
  assert.deepEqual(stick(0.1, 0.1), { x: 0, y: 0 });
  assert.deepEqual(stick(DEADZONE - 0.001, 0), { x: 0, y: 0 });
  const full = stick(1, 0);
  assert.ok(Math.abs(full.x - 1) < 1e-9 && full.y === 0);
  const diag = stick(0.9, 0.9);
  assert.ok(Math.hypot(diag.x, diag.y) <= 1.0001, 'diagonals stay on the unit circle');
  const mid = stick(0.5, 0);
  assert.ok(mid.x > 0 && mid.x < 0.5);
});

test('buttons map to the same actions as the keyboard', () => {
  const r = readPad(pad([0, 6, 7, 12]));
  assert.deepEqual([...r.held].sort(), ['aim', 'fire', 'jump', 'wall']);
  assert.equal(readPad(null).held.size, 0);
  for (const a of Object.values(PAD_BUTTONS)) assert.ok(typeof a === 'string');
  assert.equal(new Set(Object.values(PAD_BUTTONS)).size, Object.keys(PAD_BUTTONS).length, 'no action on two buttons');
});

test('sticks come through with the deadzone applied', () => {
  const r = readPad(pad([], [0.05, -1, 0.6, 0]));
  assert.ok(Math.abs(r.move.x) < 0.06, "a little cross-axis drift is fine");
  assert.ok(r.move.y < -0.99);
  assert.ok(r.look.x > 0.4 && r.look.x < 0.6);
});

test('look speed grows faster than linearly, keeps its sign, and scales with sensitivity', () => {
  assert.ok(lookRate(0.5) < 0.5 * lookRate(1));
  assert.ok(lookRate(-0.8) < 0 && lookRate(0.8) > 0);
  assert.equal(lookRate(0.8, 2), 2 * lookRate(0.8, 1));
  assert.equal(lookRate(0), 0);
});
