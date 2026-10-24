import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, Perf } from '../public/js/client/quality.js';

test('presets are ordered: higher quality never means a shorter view or smaller shadow map', () => {
  const order = ['low', 'medium', 'high', 'epic'];
  for (let i = 1; i < order.length; i++) {
    const a = PRESETS[order[i - 1]], b = PRESETS[order[i]];
    assert.ok(b.far >= a.far && b.fog[1] >= a.fog[1] && b.shadowSize >= a.shadowSize && b.particles >= a.particles && b.lod[1] >= a.lod[1], `${order[i]} vs ${order[i - 1]}`);
  }
  assert.equal(PRESETS.low.shadows, false);
  assert.equal(PRESETS.epic.post, true);
  assert.equal(PRESETS.high.post, false);
});

function run(perf, ms, frames) { for (let i = 0; i < frames; i++) perf.tick(ms); }

test('dynamic resolution steps down when frames run long and never below the preset minimum', () => {
  const seen = [];
  const perf = new Perf(PRESETS.medium, (s) => seen.push(s));
  perf.dynamic = true;
  run(perf, 40, 400); // 25 fps against a 16.9 ms target
  assert.ok(seen.length >= 3 && seen[0] < 1);
  assert.ok(perf.scale >= PRESETS.medium.minScale - 1e-9);
  assert.equal(perf.scale, PRESETS.medium.minScale);
});

test('dynamic resolution recovers slowly when there is headroom', () => {
  const seen = [];
  const perf = new Perf(PRESETS.medium, (s) => seen.push(s));
  perf.dynamic = true;
  run(perf, 40, 400);
  const low = perf.scale;
  run(perf, 8, 4000);
  assert.ok(perf.scale > low);
  assert.ok(perf.scale <= 1);
});

test('dynamic resolution stays put when the setting is off or frame time is on target', () => {
  const seen = [];
  const off = new Perf(PRESETS.high, (s) => seen.push(s));
  off.dynamic = false;
  run(off, 60, 300);
  assert.equal(seen.length, 0);
  const ok = new Perf(PRESETS.high, (s) => seen.push(s));
  ok.dynamic = true;
  run(ok, 15, 600);
  assert.equal(seen.length, 0);
  assert.ok(ok.fps >= 60 && ok.fps <= 70);
});
