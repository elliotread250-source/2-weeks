// A WebSocket proxy that adds latency, jitter and "loss" between a client and
// the game server. WebSocket runs on TCP, so a lost packet shows up as an extra
// retransmission delay that also stalls everything queued behind it; that is
// what we model. Order is always preserved.
//
//   node tools/netsim.mjs --listen 4000 --target ws://localhost:3000/ws --latency 150 --jitter 20 --loss 0.02
import { WebSocketServer, WebSocket } from 'ws';

export function startNetsim({ listen, target, latency = 50, jitter = 0, loss = 0, rto = 200 }) {
  const wss = new WebSocketServer({ port: listen });

  // Release messages in order, each no earlier than its own delay. One queue and
  // one timer per direction, because separate setTimeouts can fire out of order
  // by a millisecond and TCP never reorders.
  function lane(send) {
    const q = [];
    let last = 0;
    let timer = null;
    const pump = () => {
      timer = null;
      const now = Date.now();
      while (q.length && q[0].at <= now) { const m = q.shift(); send(m.data, m.isBinary); }
      if (q.length) timer = setTimeout(pump, Math.max(1, q[0].at - Date.now()));
    };
    return (data, isBinary) => {
      let delay = latency + (Math.random() * 2 - 1) * jitter;
      if (Math.random() < loss) delay += rto;
      const at = Math.max(last, Date.now() + Math.max(0, delay));
      last = at;
      q.push({ at, data, isBinary });
      if (!timer) timer = setTimeout(pump, Math.max(1, at - Date.now()));
    };
  }

  wss.on('connection', (client) => {
    const upstream = new WebSocket(target);
    const queue = [];
    const toUp = lane((d, b) => { if (upstream.readyState === 1) upstream.send(d, { binary: b }); });
    const toClient = lane((d, b) => { if (client.readyState === 1) client.send(d, { binary: b }); });
    upstream.on('open', () => { for (const [d, b] of queue.splice(0)) toUp(d, b); });
    client.on('message', (d, b) => (upstream.readyState === 1 ? toUp(d, b) : queue.push([d, b])));
    upstream.on('message', (d, b) => toClient(d, b));
    client.on('close', () => upstream.close());
    upstream.on('close', () => client.close());
    client.on('error', () => {});
    upstream.on('error', () => client.close());
  });
  return wss;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, arr) => (v.startsWith('--') ? [...acc, [v.slice(2), arr[i + 1]]] : acc), []));
  startNetsim({
    listen: Number(a.listen || 4000), target: a.target || 'ws://localhost:3000/ws',
    latency: Number(a.latency || 50), jitter: Number(a.jitter || 0), loss: Number(a.loss || 0),
  });
  console.log(`netsim on :${a.listen || 4000} -> ${a.target || 'ws://localhost:3000/ws'} latency=${a.latency || 50}ms jitter=${a.jitter || 0}ms loss=${a.loss || 0}`);
}
