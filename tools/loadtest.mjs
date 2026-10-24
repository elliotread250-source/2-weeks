// Load test: starts the real server in a child process, connects N WebSocket
// clients that wander and shoot, and reports server CPU, memory, tick cost and
// snapshot bandwidth per client. Usage: node tools/loadtest.mjs [clients=32] [seconds=40]
import { spawn, execSync } from 'node:child_process';
import WebSocket from 'ws';
import { encodeCommands } from '../shared/net/protocol.js';
import { emptyCommand, HELD, ACT } from '../shared/sim/controller.js';

const N = Number(process.argv[2] || 32);
const SECONDS = Number(process.argv[3] || 40);
const PORT = 3900 + Math.floor(Math.random() * 90);
const server = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: String(PORT), MAX_PLAYERS_PER_ROOM: String(N), HUMAN_TARGET: String(N), LOBBY_SECONDS: '5' },
  stdio: ['ignore', 'ignore', 'inherit'],
});
await new Promise((r) => setTimeout(r, 1500));

let bytesIn = 0;
const clients = [];
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  ws.binaryType = 'arraybuffer';
  const c = { ws, seq: 0, yaw: Math.random() * 6.28, timer: null, joined: false };
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', name: `load${i}` })));
  ws.on('message', (data, isBinary) => {
    bytesIn += data.byteLength ?? data.length;
    if (!isBinary && !c.joined) {
      const m = JSON.parse(data.toString());
      if (m.t === 'welcome') {
        c.joined = true;
        c.timer = setInterval(() => {
          const cmd = emptyCommand();
          cmd.seq = ++c.seq;
          c.yaw += (Math.random() - 0.5) * 0.3;
          cmd.yaw = c.yaw; cmd.pitch = -0.2; cmd.mz = 1;
          cmd.held = HELD.FORWARD | HELD.SPRINT | (Math.random() < 0.3 ? HELD.FIRE : 0);
          cmd.act = Math.random() < 0.05 ? ACT.JUMP : 0;
          if (ws.readyState === 1) ws.send(encodeCommands([cmd]));
        }, 1000 / 30);
      }
    }
  });
  clients.push(c);
  await new Promise((r) => setTimeout(r, 40));
}

const cpuOf = () => Number(execSync(`ps -o cputime= -p ${server.pid}`).toString().trim().split(':').reduce((a, p) => a * 60 + Number(p), 0));
await new Promise((r) => setTimeout(r, 12000)); // lobby + bus
const cpu0 = cpuOf(), t0 = Date.now(), b0 = bytesIn;
await new Promise((r) => setTimeout(r, SECONDS * 1000));
const cpu = cpuOf() - cpu0, wall = (Date.now() - t0) / 1000;
const health = await (await fetch(`http://localhost:${PORT}/health/full`)).json();
const rss = Number(execSync(`ps -o rss= -p ${server.pid}`).toString().trim()) / 1024;
const joined = clients.filter((c) => c.joined).length;
console.log(JSON.stringify({
  clients: N, joined, seconds: Math.round(wall), cpuPercentOfOneCore: +((cpu / wall) * 100).toFixed(1), rssMB: Math.round(rss),
  kbPerSecPerClient: +((bytesIn - b0) / wall / 1024 / Math.max(1, joined)).toFixed(1), rooms: health.rooms,
}));
for (const c of clients) { clearInterval(c.timer); c.ws.close(); }
server.kill();
process.exit(0);
