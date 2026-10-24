// JSON API for accounts. Same origin as the game, cookie sessions (httpOnly,
// SameSite=Lax, Secure over https). If the database is down every endpoint
// answers 503 and guests keep playing.
import crypto from 'node:crypto';
import { RateLimiter } from './limits.js';
import { AccountError } from './accounts.js';

const COOKIE = 'tw_session';

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function json(res, status, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

function readBody(req, limit = 2048) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (d) => {
      size += d.length;
      if (size > limit) { reject(new AccountError('Request too large', 413)); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(new AccountError('Bad JSON')); }
    });
    req.on('error', reject);
  });
}

export function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

export function createApi({ db, accounts }) {
  const economy = db.economy || null;
  const need = async (token) => {
    const u = await accounts.userForToken(token);
    if (!u) throw new AccountError('Sign in first', 401);
    if (!economy) throw new AccountError('Not available', 503);
    return u;
  };
  const limits = new Map(); // `${ip}:${bucket}` -> RateLimiter
  const limit = (ip, bucket, perMin) => {
    const k = `${ip}:${bucket}`;
    let l = limits.get(k);
    if (!l) { l = new RateLimiter(perMin / 60, perMin); limits.set(k, l); }
    return l.take();
  };
  setInterval(() => limits.clear(), 10 * 60 * 1000).unref();

  const cookieHeader = (req, token, maxAge) => {
    const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
    return `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  };

  // Same-origin only: a browser form on another site cannot call us with the cookie.
  const sameOrigin = (req) => {
    const origin = req.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    const ip = clientIp(req);
    await respond(req, res, url, ip);
    return true; // handled, whatever the outcome
  }

  async function respond(req, res, url, ip) {
    try {
      if (!db.ready) throw new AccountError("Can't reach the server right now", 503);
      if (req.method === 'POST' && !sameOrigin(req)) throw new AccountError('Bad origin', 403);
      const route = `${req.method} ${url.pathname}`;
      const token = parseCookies(req.headers.cookie)[COOKIE];

      switch (route) {
        case 'POST /api/register': {
          if (!limit(ip, 'register', 6)) throw new AccountError('Slow down', 429);
          const b = await readBody(req);
          const s = await accounts.register(b.username, b.pin);
          return json(res, 200, await accounts.profile(s.userId), { 'Set-Cookie': cookieHeader(req, s.token, s.maxAgeSeconds) });
        }
        case 'POST /api/login': {
          if (!limit(ip, 'login', 12)) throw new AccountError('Slow down', 429);
          const b = await readBody(req);
          const s = await accounts.login(b.username, b.pin);
          return json(res, 200, await accounts.profile(s.userId), { 'Set-Cookie': cookieHeader(req, s.token, s.maxAgeSeconds) });
        }
        case 'POST /api/logout':
          await accounts.logout(token);
          return json(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(req, '', 0) });
        case 'POST /api/loadout': {
          const u = await accounts.userForToken(token);
          if (!u) throw new AccountError('Sign in to save your locker', 401);
          const b = await readBody(req, 4096);
          return json(res, 200, { loadout: await accounts.saveLoadout(u.id, b.loadout) });
        }
        case 'GET /api/me': {
          const u = await accounts.userForToken(token);
          if (!u) return json(res, 200, { guest: true });
          const bonus = economy ? await economy.dailyLogin(u.id) : 0; // first visit of the UTC day only
          return json(res, 200, { ...(await accounts.profile(u.id)), dailyLogin: bonus });
        }
        case 'GET /api/career': {
          const u = await need(token);
          return json(res, 200, await economy.career(u.id));
        }
        case 'GET /api/shop': {
          const u = await need(token);
          return json(res, 200, await economy.shop(u.id));
        }
        case 'POST /api/shop/buy': {
          const u = await need(token);
          if (!limit(ip, 'buy', 30)) throw new AccountError('Slow down', 429);
          const b = await readBody(req, 1024);
          return json(res, 200, await economy.buy(u.id, String(b.id)));
        }
        case 'GET /api/challenges': {
          const u = await need(token);
          return json(res, 200, await economy.challenges(u.id));
        }
        case 'POST /api/challenges/reroll': {
          const u = await need(token);
          const b = await readBody(req, 1024);
          return json(res, 200, await economy.reroll(u.id, b.slot));
        }
        case 'POST /api/offline-result': {
          const u = await need(token);
          const b = await readBody(req, 1024);
          return json(res, 200, await economy.rewardOffline(u.id, b));
        }
        default:
          throw new AccountError('Not found', 404);
      }
    } catch (e) {
      if (e instanceof AccountError) {
        return json(res, e.status, { error: e.message, locked: !!e.locked, attemptsLeft: e.attemptsLeft });
      }
      console.error('[api]', e);
      return json(res, 500, { error: 'Something went wrong' });
    }
  }

  return { handle, COOKIE };
}

export const newId = () => crypto.randomBytes(8).toString('hex');
