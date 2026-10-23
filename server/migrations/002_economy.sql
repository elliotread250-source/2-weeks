-- Reroll bookkeeping for daily challenges: one row per slot rerolled that day.
CREATE TABLE challenge_rerolls (
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         text NOT NULL,
  slot        int NOT NULL,
  nonce       int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, day, slot)
);

-- Which milestone and challenge rewards were already handed out is implied by
-- the ledger (unique per user, reason, ref) and owned_items, so no extra table.
