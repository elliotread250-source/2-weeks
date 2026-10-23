// WebSocket game server. Attaches to the same HTTP server (and the same $PORT)
// that serves the static client, on the path /ws.
import { WebSocketServer } from 'ws';
import { decodeCommands, MSG } from '../shared/net/protocol.js';
import { Matchmaker } from './matchmaker.js';
import { RateLimiter, Violations, cleanName } from './limits.js';
import { parseCookies } from './api.js';
import { FREE_ITEMS, sanitizeLoadout } from '../shared/cosmetics/catalog.js';

class Client {
  constructor(ws, ip) {
    this.ws = ws;
    this.ip = ip;
    this.connected = true;
    this.room = null;
    this.fighter = null;
    this.name = 'Player';
    this.cmdLimit = new RateLimiter(100, 60); // command packets per second
    this.textLimit = new RateLimiter(10, 20);
    this.violations = new Violations();
  }

  sendText(s) { if (this.ws && this.ws.readyState === 1) this.ws.send(s); }
  sendBinary(b) { if (this.ws && this.ws.readyState === 1) this.ws.send(b, { binary: true }); }

  violate(reason) {
    if (this.violations.add(`${this.ip} ${this.name}: ${reason}`)) {
      console.warn(`[kick] ${this.ip} ${this.name}: too many violations`);
      this.ws?.close(1008, 'violations');
    }
  }

  // A resumed session takes over the original client's identity.
  adopt(old) {
    old.cmdLimit = this.cmdLimit;
    old.textLimit = this.textLimit;
    old.violations = this.violations;
    this.ws.client = old;
  }
}

export function attachGameServer(httpServer, opts = {}) {
  const matchmaker = new Matchmaker({ ...opts, db: opts.accounts ? opts.accounts.db : null });
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 4096 });

  wss.on('connection', (ws, req) => {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const client = new Client(ws, ip);
    ws.client = client;

    client.cookie = parseCookies(req.headers.cookie).tw_session || null;

    ws.on('message', (data, isBinary) => {
      const c = ws.client;
      try {
        if (isBinary) {
          if (!c.cmdLimit.take()) return c.violate('command flood');
          if (!c.room || !c.fighter) return;
          c.room.onCommands(c, decodeCommands(data));
          return;
        }
        if (!c.textLimit.take()) return c.violate('message flood');
        handleText(c, JSON.parse(data.toString())).catch((err) => c.violate(`bad message (${err.message})`));
      } catch (err) {
        c.violate(`bad message (${err.message})`);
      }
    });

    ws.on('close', () => {
      const c = ws.client;
      if (c.room && c.ws === ws) c.room.drop(c);
    });
    ws.on('error', () => {});
  });

  async function handleText(c, m) {
    switch (m.t) {
      case 'join': {
        if (c.room || c.joining) return;
        c.joining = true;
        c.name = cleanName(m.name, `Player${Math.floor(Math.random() * 900 + 100)}`);
        // Signed-in players play under their account name and get results saved.
        if (c.cookie && opts.accounts && opts.accounts.db.ready) {
          const u = await opts.accounts.userForToken(c.cookie).catch(() => null);
          if (u) { c.userId = Number(u.id); c.name = u.username; c.loadout = await opts.accounts.getLoadout(u.id).catch(() => null); }
        }
        // Guests get whatever of their loadout is free to everyone.
        if (!c.loadout) c.loadout = sanitizeLoadout(m.loadout, new Set(FREE_ITEMS));
        matchmaker.join(c, 'solo');
        break;
      }
      case 'resume': {
        if (c.room || typeof m.token !== 'string') return;
        for (const room of matchmaker.rooms) {
          if (room.state === 'playing' && room.resume(c, m.token)) return;
        }
        c.sendText(JSON.stringify({ t: 'resume-failed' }));
        break;
      }
      case 'ping': c.sendText(JSON.stringify({ t: 'pong', c: m.c, tick: c.room?.match?.tickCount ?? 0 })); break;
      default: c.violate(`unknown message ${m.t}`);
    }
  }

  // One line a minute while anything is running, so Railway logs show load.
  const report = setInterval(() => {
    const s = matchmaker.stats();
    if (s.rooms.length) console.log(`[rooms] ${JSON.stringify(s.rooms)}`);
  }, 60000);
  report.unref();

  return { wss, matchmaker, MSG };
}
