// Postgres access. Plain SQL through `pg`, a tiny numbered-migration runner,
// and graceful failure: if the database is unreachable the game still runs for
// guests and /api answers 503 until it comes back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const SCHEMA = 'twoweeks';

export class Db {
  constructor(url = process.env.DATABASE_URL) {
    this.url = url;
    this.pool = null;
    this.ready = false;
    this.lastError = null;
    this.retry = null;
  }

  // Connect and migrate. Never throws: failure leaves ready=false and retries.
  async start() {
    if (!this.url) { this.lastError = 'DATABASE_URL is not set'; return false; }
    try {
      if (!this.pool) {
        const local = /localhost|127\.0\.0\.1/.test(this.url);
        this.pool = new pg.Pool({
          connectionString: this.url,
          max: 8,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
          options: `-c search_path=${SCHEMA},public`,
          ssl: local || /\.railway\.internal/.test(this.url) ? false : { rejectUnauthorized: false },
        });
        this.pool.on('error', (e) => { this.lastError = e.message; });
      }
      await this.migrate();
      this.ready = true;
      this.lastError = null;
      return true;
    } catch (err) {
      this.ready = false;
      this.lastError = err.message;
      console.warn(`[db] not available: ${err.message}`);
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.start(), 15000);
      this.retry.unref();
      return false;
    }
  }

  async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(727274)'); // one booting instance migrates at a time
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
      await client.query(`CREATE TABLE IF NOT EXISTS ${SCHEMA}.schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
      const done = new Set((await client.query(`SELECT id FROM ${SCHEMA}.schema_migrations`)).rows.map((r) => r.id));
      const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
      for (const f of files) {
        if (done.has(f)) continue;
        await client.query('BEGIN');
        try {
          await client.query(`SET LOCAL search_path TO ${SCHEMA}, public`);
          await client.query(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
          await client.query(`INSERT INTO ${SCHEMA}.schema_migrations (id) VALUES ($1)`, [f]);
          await client.query('COMMIT');
          console.log(`[db] applied ${f}`);
        } catch (e) {
          await client.query('ROLLBACK');
          throw new Error(`migration ${f} failed: ${e.message}`);
        }
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
      client.release();
    }
  }

  query(text, params) {
    return this.pool.query(text, params);
  }

  // Run fn(client) inside one transaction; commit on success, roll back on any throw.
  async tx(fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async close() {
    clearTimeout(this.retry);
    if (this.pool) await this.pool.end();
    this.ready = false;
  }
}
