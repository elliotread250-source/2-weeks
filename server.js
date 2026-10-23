// Tiny static server for Two Weeks. Serves /public, the shared simulation code
// at /shared and the three.js package from node_modules at /vendor/three, so the
// game never depends on a third-party CDN (school networks block them).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachGameServer } from './server/index.js';
import { Db } from './server/db.js';
import { Accounts } from './server/accounts.js';
import { Economy } from './server/economy.js';
import { createApi } from './server/api.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MOUNTS = [
  { prefix: '/vendor/three/', dir: path.join(ROOT, 'node_modules', 'three'), cache: 'public, max-age=86400' },
  { prefix: '/shared/', dir: path.join(ROOT, 'shared'), cache: 'no-cache' },
];
const PUBLIC = path.join(ROOT, 'public');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function resolve(urlPath) {
  let clean;
  try { clean = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  let root = PUBLIC;
  let rel = clean;
  let cache = 'no-cache';
  for (const m of MOUNTS) {
    if (clean.startsWith(m.prefix)) {
      root = m.dir;
      rel = clean.slice(m.prefix.length - 1);
      cache = m.cache;
    }
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return null; // block path traversal
  return { file, cache };
}

export const db = new Db();
export const accounts = new Accounts(db, process.env.SESSION_SECRET);
db.economy = new Economy(accounts);
const api = createApi({ db, accounts });
if (!process.env.SESSION_SECRET) console.warn('[accounts] SESSION_SECRET is not set: sessions will not survive a restart');

const server = http.createServer(async (req, res) => {
  if (await api.handle(req, res)) return;
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('ok');
  }
  if (req.url === '/health/full') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, ...game.matchmaker.stats(), db: db.ready ? 'ok' : (db.lastError || 'down') }));
  }
  const hit = resolve(req.url);
  if (!hit) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  fs.stat(hit.file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(hit.file)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': hit.cache,
    });
    fs.createReadStream(hit.file).pipe(res);
  });
});

export { server };

// The game server shares this HTTP server's port at /ws.
export const game = attachGameServer(server, { accounts });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`Two Weeks running on http://localhost:${PORT}`);
    db.start().then((ok) => console.log(ok ? '[db] ready' : '[db] unavailable, guests only'));
  });
}
