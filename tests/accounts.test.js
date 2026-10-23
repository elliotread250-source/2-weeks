// Needs a Postgres: TEST_DATABASE_URL (default: local twoweeks_test). Skipped if unreachable.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import pg from 'pg';
import { Db } from '../server/db.js';
import { Accounts } from '../server/accounts.js';
import { createApi } from '../server/api.js';
import { validateUsername, validatePin } from '../server/names-filter.js';

const URL_ = process.env.TEST_DATABASE_URL || 'postgres://tw:tw@localhost/twoweeks_test';
let db, accounts, available = false;

before(async () => {
  const probe = new pg.Client({ connectionString: URL_ });
  try {
    await probe.connect();
    await probe.query('DROP SCHEMA IF EXISTS twoweeks CASCADE');
    available = true;
  } catch { /* no database here */ } finally { await probe.end().catch(() => {}); }
  if (!available) return;
  db = new Db(URL_);
  assert.equal(await db.start(), true);
  accounts = new Accounts(db, 'test-secret');
});
after(async () => { if (db) await db.close(); });

const needDb = (name, fn) => test(name, async (t) => { if (!available) return t.skip('no database'); await fn(t); });

test('usernames: shape, slurs, leetspeak and staff impersonation', () => {
  assert.equal(validateUsername('Ria_99').ok, true);
  for (const bad of ['ab', 'a'.repeat(17), 'no spaces', 'emoji😀x', '___', 'Admin', 'Ad_M1n', 'mod', 'xX_moderator_Xx', 'f.u.c.k', 'sh1t', 'support']) {
    assert.equal(validateUsername(bad).ok, false, bad);
  }
});

test('PINs: six or more digits, nothing trivial', () => {
  assert.equal(validatePin('482915').ok, true);
  for (const bad of ['12345', 'abcdef', '111111', '123456', '654321', '1234567890123']) assert.equal(validatePin(bad).ok, false, bad);
});

needDb('registering creates the wallet, loadout, stats and default items', async () => {
  const s = await accounts.register('Alice', '482915');
  const p = await accounts.profile(s.userId);
  assert.equal(p.user.username, 'Alice');
  assert.equal(p.wallet.coins, 0);
  assert.ok(p.owned.includes('outfit_0') && p.owned.includes('pickaxe_default'));
  assert.equal(p.loadout.emotes.length, 2);
  assert.equal(p.stats.matches, 0);
  assert.equal((await accounts.userForToken(s.token)).username, 'Alice');
});

needDb('the PIN is never stored: only a salted scrypt hash', async () => {
  const { rows } = await db.query("SELECT pin_hash, pin_salt FROM users WHERE username_key = 'alice'");
  assert.equal(rows[0].pin_hash.length, 64);
  assert.equal(rows[0].pin_salt.length, 16);
  assert.ok(!rows[0].pin_hash.toString().includes('482915'));
  await accounts.register('Bobby', '482915');
  const b = await db.query("SELECT pin_hash FROM users WHERE username_key = 'bobby'");
  assert.notDeepEqual(rows[0].pin_hash, b.rows[0].pin_hash, 'same PIN, different salt, different hash');
});

needDb('names are unique case-insensitively', async () => {
  await assert.rejects(() => accounts.register('ALICE', '739204'), /taken/);
});

needDb('login: right PIN works; wrong PIN and unknown user give the same message', async () => {
  const s = await accounts.login('alice', '482915');
  assert.ok((await accounts.userForToken(s.token)));
  await assert.rejects(() => accounts.login('alice', '000000'), /Wrong username or PIN/);
  await assert.rejects(() => accounts.login('nobody', '482915'), /Wrong username or PIN/);
});

needDb('eight bad PINs lock the account for 15 minutes, even for the right PIN', async () => {
  await accounts.register('Carol', '590183');
  for (let i = 0; i < 7; i++) await assert.rejects(() => accounts.login('carol', '111222'), /Wrong username or PIN/);
  await assert.rejects(() => accounts.login('carol', '111222'), /Too many wrong PINs/);
  await assert.rejects(() => accounts.login('carol', '590183'), (e) => e.locked === true && /minute/.test(e.message));
  await db.query("UPDATE users SET locked_until = now() - interval '1 minute' WHERE username_key = 'carol'");
  assert.ok(await accounts.login('carol', '590183'));
});

needDb('logging out kills the session', async () => {
  const s = await accounts.login('alice', '482915');
  await accounts.logout(s.token);
  assert.equal(await accounts.userForToken(s.token), null);
});

needDb('awards are idempotent and the wallet always equals the ledger', async () => {
  const { userId } = await accounts.register('Dave', '381027');
  assert.equal((await accounts.award(userId, 100, 'match_reward', 'm1')).applied, true);
  assert.equal((await accounts.award(userId, 100, 'match_reward', 'm1')).applied, false, 'replay does nothing');
  await accounts.award(userId, 40, 'challenge', 'c1');
  assert.equal((await accounts.profile(userId)).wallet.coins, 140);
  assert.equal(await accounts.walletMatchesLedger(userId), true);
});

needDb('spending checks the balance and a double click cannot double charge', async () => {
  const { userId } = await accounts.register('Erin', '294716');
  await accounts.award(userId, 500, 'match_reward', 'x');
  const buy = () => accounts.award(userId, -300, 'purchase', 'purchase-abc');
  const results = await Promise.allSettled([buy(), buy(), buy()]);
  const applied = results.filter((r) => r.status === 'fulfilled' && r.value.applied).length;
  assert.equal(applied, 1, 'exactly one charge');
  assert.equal((await accounts.profile(userId)).wallet.coins, 200);
  await assert.rejects(() => accounts.award(userId, -300, 'purchase', 'purchase-def'), /Not enough coins/);
  assert.equal(await accounts.walletMatchesLedger(userId), true);
});

needDb('concurrent awards stay consistent', async () => {
  const { userId } = await accounts.register('Finn', '618403');
  await Promise.all(Array.from({ length: 20 }, (_, i) => accounts.award(userId, 5, 'match_reward', `m${i}`)));
  assert.equal((await accounts.profile(userId)).wallet.coins, 100);
  assert.equal(await accounts.walletMatchesLedger(userId), true);
});

// ---------------------------------------------------------------- HTTP

async function withApi(fn, apiDb = db, headers = {}) {
  const acc = apiDb === db ? accounts : new Accounts(apiDb, 'x');
  const api = createApi({ db: apiDb, accounts: acc });
  const server = http.createServer(async (req, res) => { if (!(await api.handle(req, res))) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try { await fn(base, headers); } finally { server.close(); }
}

const post = (base, path, body, extra = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) });

needDb('HTTP: register sets an httpOnly SameSite=Lax cookie (Secure over https) and /api/me knows you', async () => {
  await withApi(async (base) => {
    const r = await post(base, '/api/register', { username: 'Gina', pin: '847261' }, { 'x-forwarded-proto': 'https' });
    assert.equal(r.status, 200);
    const cookie = r.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);
    const me = await fetch(base + '/api/me', { headers: { cookie: cookie.split(';')[0] } }).then((x) => x.json());
    assert.equal(me.user.username, 'Gina');
    const guest = await fetch(base + '/api/me').then((x) => x.json());
    assert.equal(guest.guest, true);
  });
});

needDb('HTTP: cross-site posts and oversized bodies are refused', async () => {
  await withApi(async (base) => {
    const r = await post(base, '/api/login', { username: 'gina', pin: '847261' }, { Origin: 'https://evil.example' });
    assert.equal(r.status, 403);
    const big = await post(base, '/api/login', { username: 'x'.repeat(5000), pin: '1' }).catch(() => ({ status: 413 }));
    assert.ok([413, 400].includes(big.status));
  });
});

needDb('HTTP: login attempts are rate limited per IP', async () => {
  await withApi(async (base) => {
    let last = 0;
    for (let i = 0; i < 20; i++) last = (await post(base, '/api/login', { username: 'nobody', pin: '123457' })).status;
    assert.equal(last, 429);
  });
});

test('HTTP: with the database down the API says so', async () => {
  const dead = new Db('postgres://nobody:nope@localhost:1/none');
  await withApi(async (base) => {
    const r = await fetch(base + '/api/me');
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /Can't reach the server/);
  }, dead);
});
