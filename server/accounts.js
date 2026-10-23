// Accounts: username + PIN (scrypt, per-user salt), cookie sessions, lockout
// after repeated bad PINs, and the coin wallet/ledger. Every coin movement is a
// transaction that writes a ledger row and the wallet together.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { validateUsername, validatePin } from './names-filter.js';

const scrypt = promisify(crypto.scrypt);
const SESSION_DAYS = 30;
const MAX_BAD_PINS = 8;
const LOCK_MINUTES = 15;

export const DEFAULT_OWNED = [
  ...Array.from({ length: 8 }, (_, i) => `outfit_${i}`),
  'pickaxe_default', 'glider_default', 'emote_wave', 'emote_dance_basic',
];

export class AccountError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.status = status;
    Object.assign(this, extra);
  }
}

export class Accounts {
  constructor(db, secret) {
    this.db = db;
    this.secret = secret || crypto.randomBytes(32).toString('hex');
    // A real hash to burn time on when the username does not exist.
    this.dummySalt = crypto.randomBytes(16);
  }

  hashToken(token) {
    return crypto.createHmac('sha256', this.secret).update(token).digest();
  }

  async derive(pin, salt) {
    return scrypt(pin, salt, 64);
  }

  async register(rawName, rawPin) {
    const n = validateUsername(rawName);
    if (!n.ok) throw new AccountError(n.error);
    const p = validatePin(rawPin);
    if (!p.ok) throw new AccountError(p.error);
    const salt = crypto.randomBytes(16);
    const hash = await this.derive(p.pin, salt);
    try {
      const userId = await this.db.tx(async (c) => {
        const { rows } = await c.query(
          'INSERT INTO users (username, username_key, pin_hash, pin_salt) VALUES ($1, $2, $3, $4) RETURNING id',
          [n.name, n.key, hash, salt],
        );
        const id = rows[0].id;
        await c.query('INSERT INTO wallets (user_id) VALUES ($1)', [id]);
        await c.query('INSERT INTO stats (user_id) VALUES ($1)', [id]);
        await c.query('INSERT INTO loadouts (user_id, emotes) VALUES ($1, $2)', [id, ['emote_wave', 'emote_dance_basic']]);
        for (const item of DEFAULT_OWNED) {
          await c.query('INSERT INTO owned_items (user_id, item_id, source) VALUES ($1, $2, $3)', [id, item, 'default']);
        }
        return id;
      });
      return this.openSession(userId);
    } catch (e) {
      if (e.code === '23505') throw new AccountError('That username is taken', 409);
      throw e;
    }
  }

  async login(rawName, rawPin) {
    const key = String(rawName ?? '').trim().toLowerCase();
    const pin = String(rawPin ?? '');
    const { rows } = await this.db.query('SELECT * FROM users WHERE username_key = $1', [key]);
    const u = rows[0];
    if (!u) {
      await this.derive(pin, this.dummySalt); // same cost as a real attempt
      throw new AccountError('Wrong username or PIN', 401);
    }
    if (u.banned) throw new AccountError('This account is suspended', 403);
    if (u.locked_until && u.locked_until > new Date()) {
      const mins = Math.ceil((u.locked_until - new Date()) / 60000);
      throw new AccountError(`Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}`, 429, { locked: true });
    }
    const hash = await this.derive(pin, u.pin_salt);
    if (!crypto.timingSafeEqual(hash, u.pin_hash)) {
      const bad = u.failed_pins + 1;
      if (bad >= MAX_BAD_PINS) {
        await this.db.query("UPDATE users SET failed_pins = 0, locked_until = now() + ($2 || ' minutes')::interval WHERE id = $1", [u.id, String(LOCK_MINUTES)]);
        throw new AccountError(`Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes`, 429, { locked: true });
      }
      await this.db.query('UPDATE users SET failed_pins = $2 WHERE id = $1', [u.id, bad]);
      throw new AccountError('Wrong username or PIN', 401, { attemptsLeft: MAX_BAD_PINS - bad });
    }
    await this.db.query('UPDATE users SET failed_pins = 0, locked_until = NULL, last_login = now() WHERE id = $1', [u.id]);
    return this.openSession(u.id);
  }

  async openSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await this.db.query(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)",
      [this.hashToken(token), userId, String(SESSION_DAYS)],
    );
    return { token, userId, maxAgeSeconds: SESSION_DAYS * 86400 };
  }

  async userForToken(token) {
    if (!token) return null;
    const { rows } = await this.db.query(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now() AND NOT u.banned`,
      [this.hashToken(token)],
    );
    return rows[0] || null;
  }

  async logout(token) {
    if (token) await this.db.query('DELETE FROM sessions WHERE token_hash = $1', [this.hashToken(token)]);
  }

  async profile(userId) {
    const [u, w, l, o, s] = await Promise.all([
      this.db.query('SELECT id, username, created_at FROM users WHERE id = $1', [userId]),
      this.db.query('SELECT coins, lifetime_earned FROM wallets WHERE user_id = $1', [userId]),
      this.db.query('SELECT * FROM loadouts WHERE user_id = $1', [userId]),
      this.db.query('SELECT item_id FROM owned_items WHERE user_id = $1 ORDER BY item_id', [userId]),
      this.db.query('SELECT * FROM stats WHERE user_id = $1', [userId]),
    ]);
    if (!u.rows[0]) return null;
    return {
      user: { id: Number(u.rows[0].id), username: u.rows[0].username, createdAt: u.rows[0].created_at },
      wallet: { coins: Number(w.rows[0].coins), lifetime: Number(w.rows[0].lifetime_earned) },
      loadout: l.rows[0],
      owned: o.rows.map((r) => r.item_id),
      stats: s.rows[0],
    };
  }

  // ------------------------------------------------------------ coins

  // Credit or debit inside an existing transaction. (user, reason, ref) is
  // unique, so replaying the same award or purchase does nothing the second time.
  async applyLedger(c, userId, delta, reason, ref = '', matchId = null) {
    const w = (await c.query('SELECT coins FROM wallets WHERE user_id = $1 FOR UPDATE', [userId])).rows[0];
    if (!w) throw new AccountError('No wallet', 404);
    const dup = await c.query('SELECT 1 FROM coin_ledger WHERE user_id = $1 AND reason = $2 AND ref = $3', [userId, reason, ref]);
    if (dup.rowCount) return { applied: false, balance: Number(w.coins) };
    const balance = Number(w.coins) + delta;
    if (balance < 0) throw new AccountError('Not enough coins', 402);
    await c.query(
      'INSERT INTO coin_ledger (user_id, delta, reason, ref, match_id, balance_after) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, delta, reason, ref, matchId, balance],
    );
    await c.query(
      'UPDATE wallets SET coins = $2, lifetime_earned = lifetime_earned + $3 WHERE user_id = $1',
      [userId, balance, Math.max(0, delta)],
    );
    return { applied: true, balance };
  }

  async award(userId, delta, reason, ref = '', matchId = null) {
    return this.db.tx((c) => this.applyLedger(c, userId, delta, reason, ref, matchId));
  }

  // True when the wallet equals the sum of the ledger. Run by tests and by the
  // nightly sanity check.
  async walletMatchesLedger(userId) {
    const { rows } = await this.db.query(
      'SELECT w.coins, COALESCE((SELECT SUM(delta) FROM coin_ledger WHERE user_id = w.user_id), 0) AS total FROM wallets w WHERE w.user_id = $1',
      [userId],
    );
    return rows[0] && Number(rows[0].coins) === Number(rows[0].total);
  }
}
