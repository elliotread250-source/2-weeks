-- Accounts, wallet, cosmetics ownership, loadouts, challenges, matches, shop, stats.
-- Everything lives in the "twoweeks" schema so this database can be shared with
-- other games without table name clashes.

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  username      text NOT NULL,
  username_key  text NOT NULL UNIQUE,          -- lower-cased, for uniqueness
  pin_hash      bytea NOT NULL,
  pin_salt      bytea NOT NULL,
  failed_pins   int NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login    timestamptz,
  banned        boolean NOT NULL DEFAULT false
);

CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

-- The wallet balance is a cache of the ledger: they must always agree.
CREATE TABLE wallets (
  user_id          bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coins            bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  lifetime_earned  bigint NOT NULL DEFAULT 0
);

CREATE TABLE coin_ledger (
  id             bigserial PRIMARY KEY,
  user_id        bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta          bigint NOT NULL,
  reason         text NOT NULL,                 -- match_reward, purchase, challenge, daily_login...
  ref            text NOT NULL DEFAULT '',      -- match id, purchase id, challenge id
  match_id       bigint,
  balance_after  bigint NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, reason, ref)                 -- makes every award and purchase idempotent
);
CREATE INDEX ledger_user ON coin_ledger(user_id, created_at DESC);

CREATE TABLE owned_items (
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id      text NOT NULL,
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL DEFAULT 'default',  -- default, shop, challenge, milestone
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE loadouts (
  user_id       bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  outfit        text NOT NULL DEFAULT 'outfit_0',
  outfit_style  text NOT NULL DEFAULT '',
  back_bling    text,
  pickaxe       text NOT NULL DEFAULT 'pickaxe_default',
  glider        text NOT NULL DEFAULT 'glider_default',
  contrail      text,
  wrap          text,
  emotes        text[] NOT NULL DEFAULT '{}',
  banner        text,
  loading_screen text,
  colours       jsonb NOT NULL DEFAULT '{}'      -- per-outfit colour picks
);

CREATE TABLE challenge_progress (
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id  text NOT NULL,
  period_key    text NOT NULL,                   -- 2026-10-23 for dailies, week key, or 'forever'
  progress      int NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  PRIMARY KEY (user_id, challenge_id, period_key)
);

CREATE TABLE matches (
  id          bigserial PRIMARY KEY,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  mode        text NOT NULL,
  seed        bigint,
  humans      int NOT NULL DEFAULT 0,
  bots        int NOT NULL DEFAULT 0
);

CREATE TABLE match_players (
  match_id      bigint NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  placement     int NOT NULL,
  kills         int NOT NULL DEFAULT 0,
  damage        int NOT NULL DEFAULT 0,
  survival_s    int NOT NULL DEFAULT 0,
  coins_earned  int NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE shop_rotations (
  day       date PRIMARY KEY,
  featured  jsonb NOT NULL,
  daily     jsonb NOT NULL
);

CREATE TABLE stats (
  user_id        bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  matches        int NOT NULL DEFAULT 0,
  wins           int NOT NULL DEFAULT 0,
  top10          int NOT NULL DEFAULT 0,
  kills          int NOT NULL DEFAULT 0,
  damage         bigint NOT NULL DEFAULT 0,
  time_alive_s   bigint NOT NULL DEFAULT 0
);
