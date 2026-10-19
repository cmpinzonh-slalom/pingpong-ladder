/**
 * Bracket state transitions shared by the match and tournament services.
 * All functions take a transaction client; callers are responsible for the transaction.
 */
import { PoolClient } from 'pg';
import { Queryable } from '../db/database';
import { bestOfForRound, RoundFormats } from '../lib/bracket';
import { conflict, notFound } from '../lib/errors';

export interface TournamentMatchRow {
  id: number;
  tournament_id: number;
  round: number;
  position: number;
  player1_id: number | null;
  player2_id: number | null;
  winner_id: number | null;
  status: 'waiting' | 'ready' | 'completed' | 'bye' | 'walkover';
  match_id: number | null;
}

export interface TournamentRow extends RoundFormats {
  id: number;
  name: string;
  starts_on: string | Date;
  signup_deadline: Date;
  max_players: number | null;
  status: 'signup' | 'in_progress' | 'completed' | 'cancelled';
  created_by: number;
  created_at: Date;
  drawn_at: Date | null;
  completed_at: Date | null;
  winner_id: number | null;
}

export async function getTournamentMatch(db: Queryable, id: number, lock = false): Promise<TournamentMatchRow> {
  const { rows } = await db.query<TournamentMatchRow>(
    `SELECT * FROM tournament_matches WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  if (rows.length === 0) throw notFound('Tournament match not found');
  return rows[0];
}

export async function getTournament(db: Queryable, id: number, lock = false): Promise<TournamentRow> {
  const { rows } = await db.query<TournamentRow>(`SELECT * FROM tournaments WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [
    id,
  ]);
  if (rows.length === 0) throw notFound('Tournament not found');
  return rows[0];
}

/**
 * LOCK ORDER (all tournament code paths must follow it to avoid deadlocks and lost updates):
 *   1. tournaments row   2. tournament_matches row   3. matches row(s)   4. users rows, ascending id (FOR NO KEY UPDATE)
 * Callers re-validate state after acquiring the locks.
 */
export async function lockBracket(
  c: PoolClient,
  tmId: number
): Promise<{ t: TournamentRow; tm: TournamentMatchRow }> {
  const { rows } = await c.query<{ tournament_id: number }>(
    `SELECT tournament_id FROM tournament_matches WHERE id = $1`,
    [tmId]
  );
  if (rows.length === 0) throw notFound('Tournament match not found');
  const t = await getTournament(c, rows[0].tournament_id, true);
  const tm = await getTournamentMatch(c, tmId, true);
  return { t, tm };
}

/** Player-driven changes (submit, correct, confirm) are only allowed while the tournament is running. */
export function assertInProgress(t: TournamentRow): void {
  if (t.status === 'cancelled') throw conflict('This tournament was cancelled');
  if (t.status !== 'in_progress') throw conflict('This tournament is not in progress');
}

export async function roundCount(db: Queryable, tournamentId: number): Promise<number> {
  const { rows } = await db.query<{ r: number | string | null }>(
    `SELECT MAX(round) AS r FROM tournament_matches WHERE tournament_id = $1`,
    [tournamentId]
  );
  return Number(rows[0]?.r ?? 0);
}

/** The format (1, 3 or 5) that applies to this bracket match. */
export async function bestOfFor(db: Queryable, tm: TournamentMatchRow): Promise<number> {
  const t = await getTournament(db, tm.tournament_id);
  return bestOfForRound(t, tm.round, await roundCount(db, tm.tournament_id));
}

async function nextMatch(c: PoolClient, tm: TournamentMatchRow): Promise<TournamentMatchRow | null> {
  const { rows } = await c.query<TournamentMatchRow>(
    `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND round = $2 AND position = $3 FOR UPDATE`,
    [tm.tournament_id, tm.round + 1, Math.floor(tm.position / 2)]
  );
  return rows[0] ?? null;
}

/** Moves the winner into the next round, or completes the tournament after the final. */
async function advance(c: PoolClient, tm: TournamentMatchRow, winnerId: number): Promise<void> {
  const next = await nextMatch(c, tm);
  if (!next) {
    await c.query(`UPDATE tournaments SET status = 'completed', completed_at = NOW(), winner_id = $2 WHERE id = $1`, [
      tm.tournament_id,
      winnerId,
    ]);
    return;
  }
  const slot = tm.position % 2 === 0 ? 'player1_id' : 'player2_id';
  const p1 = slot === 'player1_id' ? winnerId : next.player1_id;
  const p2 = slot === 'player2_id' ? winnerId : next.player2_id;
  await c.query(`UPDATE tournament_matches SET ${slot} = $2, status = $3 WHERE id = $1`, [
    next.id,
    winnerId,
    p1 && p2 ? 'ready' : 'waiting',
  ]);
}

/** Records the winner of a bracket match (confirmed result, walkover or bye) and advances them. */
export async function recordBracketWinner(
  c: PoolClient,
  tmId: number,
  winnerId: number,
  status: 'completed' | 'walkover' | 'bye',
  matchId: number | null
): Promise<void> {
  const tm = await getTournamentMatch(c, tmId, true);
  if (tm.status !== 'ready' && status !== 'bye') throw conflict('This bracket match is not open for results');
  if (winnerId !== tm.player1_id && winnerId !== tm.player2_id) throw conflict('Winner is not in this match');
  await c.query(`UPDATE tournament_matches SET winner_id = $2, status = $3, match_id = $4 WHERE id = $1`, [
    tm.id,
    winnerId,
    status,
    matchId,
  ]);
  await advance(c, tm, winnerId);
}

/**
 * Undoes a decided bracket match so an admin can override it. Only allowed while the
 * match it feeds hasn't started (no pending or confirmed result there yet).
 */
export async function reopenBracketMatch(c: PoolClient, tm: TournamentMatchRow): Promise<void> {
  const next = await nextMatch(c, tm);
  if (next) {
    const started = await c.query(
      `SELECT 1 FROM matches WHERE tournament_match_id = $1 AND status IN ('pending', 'confirmed') LIMIT 1`,
      [next.id]
    );
    if (next.status === 'completed' || next.status === 'walkover' || started.rows.length > 0) {
      throw conflict('The next-round match has already started, so this result can no longer be changed');
    }
    const slot = tm.position % 2 === 0 ? 'player1_id' : 'player2_id';
    await c.query(`UPDATE tournament_matches SET ${slot} = NULL, status = 'waiting' WHERE id = $1`, [next.id]);
  } else {
    await c.query(
      `UPDATE tournaments SET status = 'in_progress', completed_at = NULL, winner_id = NULL WHERE id = $1`,
      [tm.tournament_id]
    );
  }
  await c.query(`UPDATE tournament_matches SET winner_id = NULL, status = 'ready', match_id = NULL WHERE id = $1`, [
    tm.id,
  ]);
}
