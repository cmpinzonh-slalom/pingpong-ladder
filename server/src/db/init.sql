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

-- Admin role granted in-app by owners (owners themselves come from the ADMIN_EMAILS env var).
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ───────────── Tournaments ─────────────
-- status: signup | in_progress | completed | cancelled
-- best_of is the default format; final/semis/quarters overrides are counted back from the final.
CREATE TABLE IF NOT EXISTS tournaments (
  id                SERIAL PRIMARY KEY,
  name              TEXT NOT NULL,
  starts_on         DATE NOT NULL,
  signup_deadline   TIMESTAMPTZ NOT NULL,
  best_of           INTEGER NOT NULL DEFAULT 3,
  quarters_best_of  INTEGER,
  semis_best_of     INTEGER,
  final_best_of     INTEGER,
  max_players       INTEGER,
  status            TEXT NOT NULL DEFAULT 'signup',
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  drawn_at          TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  winner_id         INTEGER REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tournament_entries (
  id              SERIAL PRIMARY KEY,
  tournament_id   INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  withdrawn_at    TIMESTAMPTZ,
  seed            INTEGER,
  rating_at_draw  INTEGER,
  UNIQUE (tournament_id, user_id)
);

-- One row per bracket slot. round 1 is the first round; position is 0-based within the round.
-- status: waiting (players not known yet) | ready | completed | bye | walkover
CREATE TABLE IF NOT EXISTS tournament_matches (
  id             SERIAL PRIMARY KEY,
  tournament_id  INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  round          INTEGER NOT NULL,
  position       INTEGER NOT NULL,
  player1_id     INTEGER REFERENCES users(id),
  player2_id     INTEGER REFERENCES users(id),
  winner_id      INTEGER REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'waiting',
  match_id       INTEGER REFERENCES matches(id),
  UNIQUE (tournament_id, round, position)
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_t ON tournament_matches(tournament_id);

-- Links a (pending/confirmed) result to its bracket slot. NULL for regular ladder matches.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS tournament_match_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_matches_tournament_match ON matches(tournament_match_id);

-- Rating changes that aren't a confirmed match, e.g. reversing a voided (overridden) tournament result.
-- Together with confirmed matches these form each player's complete rating history.
CREATE TABLE IF NOT EXISTS rating_adjustments (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  rating_before  INTEGER NOT NULL,
  rating_after   INTEGER NOT NULL,
  reason         TEXT NOT NULL,
  match_id       INTEGER REFERENCES matches(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rating_adjustments_user ON rating_adjustments(user_id);

-- Global order in which rating changes were applied. Timestamps can tie (NOW() is fixed per transaction,
-- e.g. an override that reverses one result and confirms another), so history is ordered by this sequence.
CREATE SEQUENCE IF NOT EXISTS rating_event_seq;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS rating_seq BIGINT;
ALTER TABLE rating_adjustments ADD COLUMN IF NOT EXISTS rating_seq BIGINT;
