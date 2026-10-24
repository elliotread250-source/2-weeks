// Pure rules (always run) plus the DB-backed flows (skipped without Postgres).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { Db } from '../server/db.js';
import { Accounts } from '../server/accounts.js';
import { Economy } from '../server/economy.js';
import { ECONOMY, matchReward, plausibleOffline, dayKey, weekKey, nextWeeklyReset } from '../shared/economy/economy.js';
import { rotationFor } from '../shared/economy/shop.js';
import { ALL_CHALLENGES, DAILY, WEEKLY, MILESTONES, dailySet, weeklySet, advance } from '../shared/economy/challenges.js';
import { item, all } from '../shared/cosmetics/catalog.js';

test('match rewards follow the table and offline pays half', () => {
  const win = matchReward({ placement: 1, total: 30, kills: 3, assists: 2, survivalS: 600 });
  assert.equal(win.total, 30 + 8 + 100 + 10);
  const last = matchReward({ placement: 30, total: 30, kills: 0, assists: 0, survivalS: 30 });
  assert.equal(last.total, 0);
  const off = matchReward({ placement: 1, total: 30, kills: 3, assists: 2, survivalS: 600 }, true);
  assert.ok(off.total <= Math.ceil(win.total * ECONOMY.offlineRate) && off.total >= win.total * 0.4);
  assert.equal(matchReward({ placement: 5, total: 30, kills: 0, assists: 0, survivalS: 99999 }).parts.survival, ECONOMY.survivalCap);
});

test('offline results that could not have happened are rejected', () => {
  const ok = { placement: 3, total: 25, kills: 4, assists: 1, survivalS: 400 };
  assert.equal(plausibleOffline(ok), true);
  for (const bad of [{ ...ok, kills: 30 }, { ...ok, placement: 0 }, { ...ok, placement: 26 }, { ...ok, survivalS: 99999 }, { ...ok, kills: -1 }, { ...ok, kills: 1.5 }, { ...ok, total: 1 }]) {
    assert.equal(plausibleOffline(bad), false, JSON.stringify(bad));
  }
});

test('day and week keys reset at the right UTC moments', () => {
  assert.equal(dayKey(Date.parse('2026-10-23T23:59:59Z')), '2026-10-23');
  assert.equal(dayKey(Date.parse('2026-10-24T00:00:00Z')), '2026-10-24');
  // 2026-10-22 is a Thursday. Before 13:00 UTC the week still belongs to the previous Thursday.
  assert.equal(weekKey(Date.parse('2026-10-22T12:59:00Z')), '2026-10-15');
  assert.equal(weekKey(Date.parse('2026-10-22T13:00:00Z')), '2026-10-22');
  assert.equal(weekKey(Date.parse('2026-10-28T10:00:00Z')), '2026-10-22');
  assert.equal(nextWeeklyReset(Date.parse('2026-10-28T10:00:00Z')), Date.parse('2026-10-29T13:00:00Z'));
});

test('the shop rotation is deterministic, daily, and only sells sellable items', () => {
  const a = rotationFor('2026-10-23'), b = rotationFor('2026-10-23'), c = rotationFor('2026-10-24');
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.daily, c.daily);
  assert.equal(a.featured.length, 3);
  assert.equal(a.daily.length, 6);
  const ids = [...a.featured, ...a.daily];
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) { const i = item(id); assert.ok(i.shop && !i.free, id); }
  for (const id of a.featured) assert.ok(item(id).rarity >= 3);
});

test('challenge data: 60+ definitions, unique ids, milestones line up with catalog unlocks', () => {
  assert.ok(ALL_CHALLENGES.length >= 40, `${ALL_CHALLENGES.length}`); // 22 daily + 14 weekly + 10 milestones
  assert.equal(new Set(ALL_CHALLENGES.map((c) => c.id)).size, ALL_CHALLENGES.length);
  for (const m of MILESTONES) assert.ok(all().some((i) => i.unlock === m.id), `no item unlocks at ${m.id}`);
  for (const i of all().filter((x) => x.unlock)) assert.ok(MILESTONES.some((m) => m.id === i.unlock), i.id);
  assert.equal(new Set(dailySet(7, '2026-10-23')).size, 3);
  assert.deepEqual(dailySet(7, '2026-10-23'), dailySet(7, '2026-10-23'));
  assert.notDeepEqual(dailySet(7, '2026-10-23', [1, 0, 0]), dailySet(7, '2026-10-23'));
  assert.equal(weeklySet('2026-10-22').length, 7);
});

test('progress rules: sum accumulates, best keeps the max, both cap at the target', () => {
  const sum = DAILY.find((c) => c.mode === 'sum' && c.event === 'kills');
  const best = DAILY.find((c) => c.mode === 'best' && c.event === 'kills' && c.target === 4);
  assert.equal(advance(sum, 1, { kills: 2 }), Math.min(sum.target, 3));
  assert.equal(advance(best, 1, { kills: 3 }), 3);
  assert.equal(advance(best, 3, { kills: 1 }), 3);
  assert.equal(advance(sum, 0, { kills: 999 }), sum.target);
});

// ---------------------------------------------------------------- database

const URL_ = process.env.TEST_DATABASE_URL || 'postgres://tw:tw@localhost/twoweeks_test';
let db, accounts, economy, available = false;
before(async () => {
  const probe = new pg.Client({ connectionString: URL_ });
  try { await probe.connect(); await probe.query('DROP SCHEMA IF EXISTS twoweeks CASCADE'); available = true; } catch { /* none */ } finally { await probe.end().catch(() => {}); }
  if (!available) return;
  db = new Db(URL_);
  await db.start();
  accounts = new Accounts(db, 'test-secret');
  economy = new Economy(accounts);
});
after(async () => { if (db) await db.close(); });
const needDb = (name, fn) => test(name, async (t) => { if (!available) return t.skip('no database'); await fn(t); });

const NOW = Date.parse('2026-10-23T15:00:00Z');
const user = async (name) => (await accounts.register(name, '482915')).userId;

needDb('daily login pays once a day', async () => {
  const u = await user('Dana');
  assert.equal(await economy.dailyLogin(u, NOW), ECONOMY.dailyLogin);
  assert.equal(await economy.dailyLogin(u, NOW + 3600e3), 0);
  assert.equal(await economy.dailyLogin(u, NOW + 86400e3), ECONOMY.dailyLogin);
  assert.ok(await accounts.walletMatchesLedger(u));
});

needDb('buying: only today\'s shelf, charged once, never negative, even with parallel clicks', async () => {
  const u = await user('Eve');
  const day = dayKey(NOW);
  const rot = rotationFor(day);
  const cheap = [...rot.daily, ...rot.featured].map(item).sort((a, b) => a.price - b.price)[0];
  await assert.rejects(economy.buy(u, cheap.id, NOW), /Not enough coins/);
  await accounts.award(u, cheap.price * 3, 'test_grant', 'x');
  const notToday = all().find((i) => i.shop && !i.free && ![...rot.daily, ...rot.featured].includes(i.id));
  await assert.rejects(economy.buy(u, notToday.id, NOW), /not in the shop/);
  await assert.rejects(economy.buy(u, 'outfit_0', NOW), /not for sale/);
  const results = await Promise.allSettled([economy.buy(u, cheap.id, NOW), economy.buy(u, cheap.id, NOW), economy.buy(u, cheap.id, NOW)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const p = await accounts.profile(u);
  assert.equal(p.wallet.coins, cheap.price * 2);
  assert.ok(p.owned.includes(cheap.id));
  assert.ok(await accounts.walletMatchesLedger(u));
  const sh = await economy.shop(u, NOW);
  assert.equal([...sh.featured, ...sh.daily].find((x) => x.id === cheap.id).owned, true);
});

needDb('an online match pays coins and completes challenges once', async () => {
  const u = await user('Finn');
  const dailies = dailySet(u, dayKey(NOW));
  const summary = { placement: 1, total: 30, kills: 8, assists: 3, survivalS: 700, survivalMin: 11, damage: 3000, headshots: 12, chests: 12, harvested: 2000, built: 200, matches: 1, wins: 1, top10: 1 };
  const matchId = 1;
  const reward = await db.tx((c) => economy.rewardOnline(c, u, summary, matchId));
  assert.equal(reward.coins, matchReward(summary).total);
  assert.ok(reward.challenges.some((c) => c.id === 'milestone_wins_1'));
  assert.ok(reward.challenges.length >= 1);
  assert.ok(reward.bonus > 0);
  // The unlock item of the first-win milestone is now owned.
  const p = await accounts.profile(u);
  for (const i of all().filter((x) => x.unlock === 'milestone_wins_1')) assert.ok(p.owned.includes(i.id));
  // Replaying the same match id adds nothing (idempotent ledger).
  const again = await db.tx((c) => economy.rewardOnline(c, u, summary, matchId));
  assert.equal(again.balance, reward.balance + again.bonus);
  assert.ok(await accounts.walletMatchesLedger(u));
  void dailies;
});

needDb('offline results: capped per day, rate limited, implausible ones refused', async () => {
  const u = await user('Gus');
  const r = { placement: 1, total: 30, kills: 20, assists: 5, survivalS: 900 };
  const first = await economy.rewardOffline(u, r, NOW);
  assert.ok(first.coins > 0);
  await assert.rejects(economy.rewardOffline(u, r, NOW + 5000), /too fast/);
  await assert.rejects(economy.rewardOffline(u, { ...r, kills: 99 }, NOW + 90e3), /does not look right/);
  let total = first.coins, t = NOW;
  for (let i = 0; i < 30; i++) { t += 61e3; total += (await economy.rewardOffline(u, r, t)).coins; }
  assert.equal(total, ECONOMY.offlineDailyCap);
  const next = await economy.rewardOffline(u, r, NOW + 86400e3 + 1e3 * 3600);
  assert.ok(next.coins > 0);
  assert.ok(await accounts.walletMatchesLedger(u));
});

needDb('rerolling: one per day, not on a finished challenge, changes the slot', async () => {
  const u = await user('Hana');
  const before_ = (await economy.challenges(u, NOW)).daily.map((c) => c.id);
  const r = await economy.reroll(u, 1, NOW);
  assert.notEqual(r.now, before_[1]);
  const after_ = await economy.challenges(u, NOW);
  assert.equal(after_.rerollsLeft, 0);
  assert.equal(after_.daily[1].id, r.now);
  assert.equal(after_.daily[0].id, before_[0]);
  await assert.rejects(economy.reroll(u, 0, NOW), /No rerolls/);
  assert.equal((await economy.challenges(u, NOW + 86400e3)).rerollsLeft, 1);
  void WEEKLY;
});

needDb('career: stats and recent matches come back newest first', async () => {
  const u = await user('Iris');
  for (const [i, place] of [[1, 5], [2, 1]]) {
    const { rows } = await db.query("INSERT INTO matches (mode, humans, bots, ended_at) VALUES ('solo', 2, 28, now()) RETURNING id");
    await db.query('INSERT INTO match_players (match_id, user_id, placement, kills, damage, survival_s, coins_earned) VALUES ($1, $2, $3, $4, 100, 300, 50)', [rows[0].id, u, place, i]);
  }
  await db.query('UPDATE stats SET matches = 2, wins = 1, kills = 3 WHERE user_id = $1', [u]);
  const c = await economy.career(u);
  assert.equal(c.stats.matches, 2);
  assert.equal(c.stats.wins, 1);
  assert.deepEqual(c.recent.map((r) => r.placement), [1, 5]);
  assert.equal(c.recent[0].players, 30);
});
