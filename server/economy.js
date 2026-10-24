// Coins, shop and challenges on the server. Everything that moves coins goes
// through accounts.applyLedger inside one transaction, so a double click, a
// retried request or two tabs can never pay or charge twice.
import { AccountError } from './accounts.js';
import { item, all } from '../shared/cosmetics/catalog.js';
import { ECONOMY, matchReward, plausibleOffline, dayKey, weekKey, nextDailyReset, nextWeeklyReset } from '../shared/economy/economy.js';
import { rotationFor, inShop } from '../shared/economy/shop.js';
import { BY_ID, MILESTONES, dailySet, weeklySet, advance, REROLL_PER_DAY } from '../shared/economy/challenges.js';

export class Economy {
  constructor(accounts) {
    this.accounts = accounts;
    this.db = accounts.db;
  }

  // ------------------------------------------------------------ daily login

  async dailyLogin(userId, now = Date.now()) {
    const day = dayKey(now);
    const r = await this.accounts.award(userId, ECONOMY.dailyLogin, 'daily_login', day);
    return r.applied ? ECONOMY.dailyLogin : 0;
  }

  // ------------------------------------------------------------ career

  async career(userId) {
    const [s, m] = await Promise.all([
      this.db.query('SELECT matches, wins, top10, kills, damage, time_alive_s FROM stats WHERE user_id = $1', [userId]),
      this.db.query(
        `SELECT mp.placement, mp.kills, mp.damage, mp.survival_s, mp.coins_earned, mt.ended_at, mt.humans, mt.bots
         FROM match_players mp JOIN matches mt ON mt.id = mp.match_id WHERE mp.user_id = $1 ORDER BY mt.id DESC LIMIT 12`,
        [userId],
      ),
    ]);
    const st = s.rows[0] || { matches: 0, wins: 0, top10: 0, kills: 0, damage: 0, time_alive_s: 0 };
    const n = (v) => Number(v);
    return {
      stats: { matches: n(st.matches), wins: n(st.wins), top10: n(st.top10), kills: n(st.kills), damage: n(st.damage), timeAliveS: n(st.time_alive_s) },
      recent: m.rows.map((r) => ({ placement: r.placement, kills: r.kills, damage: r.damage, survivalS: r.survival_s, coins: r.coins_earned, at: r.ended_at, players: r.humans + r.bots })),
    };
  }

  // ------------------------------------------------------------ shop

  async shop(userId, now = Date.now()) {
    const day = dayKey(now);
    const rot = rotationFor(day);
    const owned = await this.accounts.ownedSet(userId);
    const view = (id) => { const i = item(id); return { id, name: i.name, type: i.type, rarity: i.rarity, price: i.price, owned: owned.has(id) }; };
    return { day, resetsAt: nextDailyReset(now), featured: rot.featured.map(view), daily: rot.daily.map(view) };
  }

  // One transaction: check shop + ownership, debit coins (idempotent per item), grant the item.
  async buy(userId, id, now = Date.now()) {
    const it = item(id);
    if (!it || !it.shop || it.free) throw new AccountError('That item is not for sale', 404);
    if (!inShop(id, dayKey(now))) throw new AccountError('That item is not in the shop today', 409);
    return this.db.tx(async (c) => {
      const has = await c.query('SELECT 1 FROM owned_items WHERE user_id = $1 AND item_id = $2', [userId, id]);
      if (has.rowCount) throw new AccountError('You already own that', 409);
      const r = await this.accounts.applyLedger(c, userId, -it.price, 'purchase', id);
      if (!r.applied) throw new AccountError('You already own that', 409);
      await c.query("INSERT INTO owned_items (user_id, item_id, source) VALUES ($1, $2, 'shop')", [userId, id]);
      return { id, balance: r.balance };
    });
  }

  // ------------------------------------------------------------ challenges

  async nonces(userId, day) {
    const { rows } = await this.db.query('SELECT slot, nonce FROM challenge_rerolls WHERE user_id = $1 AND day = $2', [userId, day]);
    const n = [0, 0, 0];
    for (const r of rows) n[r.slot] = r.nonce;
    return n;
  }

  // The player's active challenges with progress. Milestones are always listed.
  async challenges(userId, now = Date.now()) {
    const day = dayKey(now), wk = weekKey(now);
    const nonces = await this.nonces(userId, day);
    const dailies = dailySet(userId, day, nonces);
    const weeklies = weeklySet(wk);
    const { rows } = await this.db.query('SELECT challenge_id, period_key, progress, completed_at FROM challenge_progress WHERE user_id = $1', [userId]);
    const prog = new Map(rows.map((r) => [`${r.challenge_id}|${r.period_key}`, r]));
    const make = (id, period) => {
      const def = BY_ID.get(id);
      const row = prog.get(`${id}|${period}`);
      return { id, text: def.text, kind: def.kind, target: def.target, coins: def.coins, progress: row ? row.progress : 0, done: !!(row && row.completed_at) };
    };
    const rerolled = nonces.filter((n) => n > 0).length;
    return {
      daily: dailies.map((id) => make(id, day)),
      weekly: weeklies.map((id) => make(id, wk)),
      milestones: MILESTONES.map((m) => make(m.id, 'forever')),
      rerollsLeft: Math.max(0, REROLL_PER_DAY - rerolled),
      dailyResetsAt: nextDailyReset(now),
      weeklyResetsAt: nextWeeklyReset(now),
    };
  }

  async reroll(userId, slot, now = Date.now()) {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) throw new AccountError('Bad slot', 400);
    const day = dayKey(now);
    return this.db.tx(async (c) => {
      const { rows } = await c.query('SELECT slot, nonce FROM challenge_rerolls WHERE user_id = $1 AND day = $2 FOR UPDATE', [userId, day]);
      if (rows.length >= REROLL_PER_DAY) throw new AccountError('No rerolls left today', 409);
      const nonces = [0, 0, 0];
      for (const r of rows) nonces[r.slot] = r.nonce;
      const before = dailySet(userId, day, nonces)[slot];
      const done = await c.query('SELECT completed_at FROM challenge_progress WHERE user_id = $1 AND challenge_id = $2 AND period_key = $3', [userId, before, day]);
      if (done.rows[0] && done.rows[0].completed_at) throw new AccountError('That challenge is already complete', 409);
      nonces[slot] += 1;
      await c.query('INSERT INTO challenge_rerolls (user_id, day, slot, nonce) VALUES ($1, $2, $3, $4)', [userId, day, slot, nonces[slot]]);
      return { slot, now: dailySet(userId, day, nonces)[slot] };
    });
  }

  // Fold a finished match into progress. Runs inside the match-recording
  // transaction so a crash cannot pay coins without counting progress or the reverse.
  async applyChallenges(c, userId, summary, matchId, now = Date.now()) {
    const day = dayKey(now), wk = weekKey(now);
    const nonces = await this.nonces(userId, day);
    const active = [
      ...dailySet(userId, day, nonces).map((id) => [id, day]),
      ...weeklySet(wk).map((id) => [id, wk]),
      ...MILESTONES.map((m) => [m.id, 'forever']),
    ];
    const completed = [];
    for (const [id, period] of active) {
      const def = BY_ID.get(id);
      const cur = (await c.query('SELECT progress, completed_at FROM challenge_progress WHERE user_id = $1 AND challenge_id = $2 AND period_key = $3 FOR UPDATE', [userId, id, period])).rows[0];
      if (cur && cur.completed_at) continue;
      const next = advance(def, cur ? cur.progress : 0, summary);
      const done = next >= def.target;
      await c.query(
        `INSERT INTO challenge_progress (user_id, challenge_id, period_key, progress, completed_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, challenge_id, period_key) DO UPDATE SET progress = $4, completed_at = $5`,
        [userId, id, period, next, done ? new Date(now) : null],
      );
      if (!done) continue;
      await this.accounts.applyLedger(c, userId, def.coins, 'challenge', `${id}:${period}`, matchId);
      const unlocks = all().filter((i) => i.unlock === id).map((i) => i.id);
      for (const it of unlocks) await c.query("INSERT INTO owned_items (user_id, item_id, source) VALUES ($1, $2, 'milestone') ON CONFLICT DO NOTHING", [userId, it]);
      completed.push({ id, text: def.text, coins: def.coins, items: unlocks });
    }
    return completed;
  }

  // ------------------------------------------------------------ match rewards

  // Called from recordMatch inside its transaction. Returns what to show the player.
  async rewardOnline(c, userId, summary, matchId) {
    const reward = matchReward(summary);
    await this.accounts.applyLedger(c, userId, reward.total, 'match_reward', String(matchId), matchId);
    const challenges = await this.applyChallenges(c, userId, summary, matchId);
    const bonus = challenges.reduce((a, x) => a + x.coins, 0);
    const bal = (await c.query('SELECT coins FROM wallets WHERE user_id = $1', [userId])).rows[0];
    return { coins: reward.total, parts: reward.parts, challenges, bonus, balance: Number(bal.coins) };
  }

  // A result the client reports after an offline match. Capped and sanity-checked;
  // a determined cheater can still farm up to the daily cap, which is the stated limit.
  async rewardOffline(userId, r, now = Date.now()) {
    if (!plausibleOffline(r)) throw new AccountError('That result does not look right', 400);
    const day = dayKey(now);
    return this.db.tx(async (c) => {
      await c.query('SELECT 1 FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
      const today = await c.query(
        // The ref carries the submission time, so the gap check and the tests share one clock.
        "SELECT COALESCE(SUM(delta), 0) AS s, MAX(split_part(ref, ':', 3)::bigint) AS last FROM coin_ledger WHERE user_id = $1 AND reason = 'offline_reward' AND ref LIKE $2",
        [userId, `${day}:%`],
      );
      const spent = Number(today.rows[0].s);
      const last = today.rows[0].last ? Number(today.rows[0].last) : 0;
      if (now - last < ECONOMY.offlineMinGapS * 1000) throw new AccountError('Too many results too fast', 429);
      const reward = matchReward(r, true);
      const pay = Math.max(0, Math.min(reward.total, ECONOMY.offlineDailyCap - spent));
      if (!pay) return { coins: 0, capped: true, parts: reward.parts, balance: null };
      const count = Number((await c.query("SELECT COUNT(*) AS n FROM coin_ledger WHERE user_id = $1 AND reason = 'offline_reward' AND ref LIKE $2", [userId, `${day}:%`])).rows[0].n);
      const res = await this.accounts.applyLedger(c, userId, pay, 'offline_reward', `${day}:${count + 1}:${now}`);
      return { coins: pay, capped: pay < reward.total, parts: reward.parts, balance: res.balance };
    });
  }
}
