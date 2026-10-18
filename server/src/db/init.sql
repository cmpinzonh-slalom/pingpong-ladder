-- Ping Pong Ladder schema. Idempotent: safe to run multiple times.

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  rating        INTEGER NOT NULL DEFAULT 1200,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password auth (added after the original magic-link version; ALTERs keep existing DBs in sync).
-- password_hash is NULL for accounts that haven't set a password yet (they can claim it by registering).
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- Set after an admin reset: the user must choose a new password on next login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
-- Bumped on password change/reset to invalidate existing sessions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- Legacy magic-link table, no longer used.
DROP TABLE IF EXISTS login_tokens;

-- status: pending | confirmed | superseded | withdrawn
CREATE TABLE IF NOT EXISTS matches (
  id                 SERIAL PRIMARY KEY,
  player_a_id        INTEGER NOT NULL REFERENCES users(id),
  player_b_id        INTEGER NOT NULL REFERENCES users(id),
  submitted_by       INTEGER NOT NULL REFERENCES users(id),
  awaiting_user_id   INTEGER REFERENCES users(id),
  winner_id          INTEGER NOT NULL REFERENCES users(id),
  status             TEXT NOT NULL DEFAULT 'pending',
  parent_match_id    INTEGER REFERENCES matches(id),
  played_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at       TIMESTAMPTZ,
  rating_a_before    INTEGER,
  rating_b_before    INTEGER,
  rating_a_after     INTEGER,
  rating_b_after     INTEGER,
  CHECK (player_a_id <> player_b_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_player_a ON matches(player_a_id);
CREATE INDEX IF NOT EXISTS idx_matches_player_b ON matches(player_b_id);

CREATE TABLE IF NOT EXISTS match_games (
  id        SERIAL PRIMARY KEY,
  match_id  INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_no   INTEGER NOT NULL,
  score_a   INTEGER NOT NULL,
  score_b   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_match_games_match ON match_games(match_id);
