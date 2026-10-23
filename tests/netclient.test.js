// The real client netcode (NetHost) against the real server through a lossy,
// laggy proxy, with no browser: prediction must stay close to the server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startNetsim } from '../tools/netsim.mjs';
import { NetHost } from '../public/js/client/nethost.js';
import { emptyCommand, ACT, HELD } from '../shared/sim/controller.js';

// The game server runs as its own process so the client loop and the server
// loop do not starve each other the way they would on one event loop.
async function session({ latency, jitter, loss }) {
  const port = 4100 + Math.floor(Math.random() * 800);
  const child = spawn(process.execPath, ['server.js'], {
    env: { ...process.env, PORT: String(port), MAX_PLAYERS_PER_ROOM: '6', LOBBY_SECONDS: '0.5', HUMAN_TARGET: '1' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve) => child.stdout.on('data', (d) => { if (String(d).includes('running')) resolve(); }));
  const proxy = startNetsim({ listen: 0, target: `ws://localhost:${port}/ws`, latency, jitter, loss });
  await new Promise((r) => proxy.on('listening', r));
  const host = await NetHost.connect(`ws://localhost:${proxy.address().port}/ws`, { name: 'tester' });
  const stop = () => { host.close(); proxy.close(); child.kill(); };
  return { host, stop };
}

// Drive the client like a 60 fps game loop for `seconds` of wall time.
async function play(host, seconds, script) {
  const t0 = Date.now();
  let last = t0;
  while (Date.now() - t0 < seconds * 1000) {
    await new Promise((r) => setTimeout(r, 16));
    const now = Date.now();
    const t = (now - t0) / 1000;
    host.step((now - last) / 1000, () => ({ ...emptyCommand(), ...script(t, host) }));
    last = now;
  }
}

async function scenario(net) {
  const { host, stop } = await session(net);
  let jumped = false;
  await play(host, 14, (t, h) => {
    const cmd = { yaw: Math.sin(t * 0.5) * 1.2, pitch: -1.1, mz: 1, held: HELD.FORWARD };
    if (!jumped && h.match.bus && h.match.bus.t > 2) { jumped = true; cmd.act = ACT.JUMP; }
    if (h.local.state === 'glide' || h.local.state === 'ground') { cmd.pitch = 0; }
    if (h.local.state === 'ground') {
      cmd.held |= HELD.SPRINT;
      if (Math.floor(t * 2) % 3 === 0) cmd.held |= HELD.JUMP;
      cmd.mx = Math.sin(t) > 0 ? 1 : -1; // strafe back and forth
    }
    return cmd;
  });
  const out = { stats: { ...host.stats }, state: host.local.state, rtt: host.rtt, jumped };
  stop();
  return out;
}

for (const net of [
  { name: '50 ms', latency: 25, jitter: 3, loss: 0 },
  { name: '150 ms, 2% loss', latency: 75, jitter: 10, loss: 0.02 },
  { name: '250 ms, 2% loss', latency: 125, jitter: 20, loss: 0.02 },
]) {
  test(`prediction stays accurate at ${net.name}`, async () => {
    const r = await scenario(net);
    const mean = r.stats.errSum / Math.max(1, r.stats.snapshots);
    console.log(`  ${net.name}: snapshots=${r.stats.snapshots} meanErr=${mean.toFixed(4)}m maxErr=${r.stats.maxError.toFixed(3)}m snaps=${r.stats.snaps} big=${JSON.stringify(r.stats.big)} rtt=${Math.round(r.rtt)}ms state=${r.state}`);
    assert.ok(r.jumped, 'client left the bus');
    assert.ok(r.stats.snapshots > 100);
    assert.equal(r.stats.snaps, 0, 'no hard snaps');
    assert.ok(mean < 0.25, `mean correction ${mean}`);
  });
}
