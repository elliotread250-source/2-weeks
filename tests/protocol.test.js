import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeCommands, decodeCommands, encodeSnapshot, decodeSnapshot, QUANT, sanitizeCommand,
} from '../shared/net/protocol.js';
import { Match } from '../shared/sim/match.js';

test('commands survive a round trip', () => {
  const cmds = [
    { seq: 7, viewTick: 100, mx: 1, mz: -1, yaw: 1.25, pitch: -0.4, held: 0x25, act: 0x142, slot: 3, slotStep: -1, piece: 2, matStep: 1 },
    { seq: 8, viewTick: 101, mx: 0, mz: 1, yaw: -3, pitch: 0.1, held: 1, act: 2, slot: -1, slotStep: 0, piece: -1, matStep: 0 },
  ];
  const out = decodeCommands(encodeCommands(cmds));
  assert.equal(out.length, 2);
  for (let i = 0; i < 2; i++) {
    for (const k of ['seq', 'viewTick', 'held', 'act', 'slot', 'slotStep', 'piece', 'matStep']) assert.equal(out[i][k], cmds[i][k], k);
    assert.ok(Math.abs(out[i].yaw - cmds[i].yaw) < 1e-5);
    assert.ok(Math.abs(out[i].mz - cmds[i].mz) < 0.01);
  }
});

test('hostile command fields are clamped', () => {
  const c = sanitizeCommand({ seq: 1, viewTick: 0, mx: 99, mz: NaN, yaw: Infinity, pitch: 50, held: 0xffff, act: 0xffff, slot: 99, slotStep: 9, piece: -9, matStep: 7 });
  assert.equal(c.mx, 1);
  assert.equal(c.mz, 0);
  assert.equal(c.yaw, 0);
  assert.equal(c.pitch, 1.5);
  assert.equal(c.held, 0x7f);
  assert.equal(c.act, 0x3ff);
  assert.equal(c.slot, 5);
  assert.equal(c.piece, -1);
});

test('quantisation error stays small', () => {
  for (const v of [-280, -3.14159, 0, 12.345, 99.99, 280]) assert.ok(Math.abs(QUANT.unpos(QUANT.pos(v)) - v) < 0.02);
  for (const a of [0, 1, 3.14, 6.2]) assert.ok(Math.abs(QUANT.unyaw(QUANT.yaw(a)) - a) < 0.0002);
});

test('a snapshot round-trips fighters and the private block', () => {
  const m = new Match({ seed: 3, botCount: 3 });
  const me = m.addHuman('me');
  m.addBots(3);
  m.start();
  for (let i = 0; i < 100; i++) { m.tick(); m.takeEvents(); }
  me.slots[0] = { kind: 'weapon', type: 'ar', rarity: 3, mag: 21 };
  me.mats.wood = 77;
  const bytes = encodeSnapshot({ tick: m.tickCount, ackSeq: 42, match: m, self: me, updated: m.fighters.filter((f) => f !== me), removed: [999] });
  const s = decodeSnapshot(bytes);
  assert.equal(s.tick, m.tickCount);
  assert.equal(s.ackSeq, 42);
  assert.equal(s.fighters.length, 3);
  assert.deepEqual(s.removed, [999]);
  assert.equal(s.self.id, me.id);
  assert.equal(s.selfPrivate.mats.wood, 77);
  assert.deepEqual(s.selfPrivate.slots[0], { kind: 'weapon', type: 'ar', rarity: 3, mag: 21 });
  assert.ok(Math.abs(s.self.x - me.pos.x) < 0.02);
  assert.ok(bytes.length < 400, `snapshot of 4 fighters is ${bytes.length} bytes`);
});
