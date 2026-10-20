import { PoolClient } from 'pg';
import { query, Queryable, withTransaction } from '../db/database';

/** Pool-backed Queryable for reads outside a transaction. */
const pool = { query } as Queryable;
import { bestOfForRound, drawBracket, roundName, totalRounds } from '../lib/bracket';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import {
  assertInProgress,
  bestOfFor,
  getTournament,
  getTournamentMatch,
  lockBracket,
  recordBracketWinner,
  reopenBracketMatch,
  TournamentMatchRow,
  TournamentRow,
} from './bracketDb';
import {
  applyConfirmation,
  displayName,
  voidConfirmed,
  getMatch,
  hydrate,
  insertMatch,
  MatchRow,
  notify,
  parseGames,
  parsePlayedAt,
} from './matches';

const FORMATS = [1, 3, 5];

interface EntryRow {
  user_id: number;
  joined_at: Date;
  withdrawn_at: Date | null;
  seed: number | null;
  rating_at_draw: number | null;
  display_name: string | null;
  email: string;
  rating: number;
}

/** DATE columns are strings via the pg type parser; pg-mem (tests) returns UTC-midnight Dates. */
function ymd(d: string | Date): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ───────────── Input validation ─────────────

interface TournamentInput {
  name: string;
  starts_on: string;
  signup_deadline: Date;
  best_of: number;
  quarters_best_of: number | null;
  semis_best_of: number | null;
  final_best_of: number | null;
  max_players: number | null;
}

function parseFormat(raw: unknown, field: string, optional: boolean): number | null {
  if (optional && (raw === undefined || raw === null || raw === '')) return null;
  const n = Number(raw);
  if (!FORMATS.includes(n)) throw badRequest(`${field} must be 1, 3 or 5`);
  return n;
}

/**
 * True only for real calendar dates. JS normalizes impossible dates (2026-02-30 -> March 2),
 * so require the parsed UTC date to round-trip to the exact input.
 */
export function isCalendarDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function parseTournamentInput(body: Record<string, unknown>): TournamentInput {
  const name = String(body.name ?? '').trim();
  if (name.length < 3 || name.length > 80) throw badRequest('Name must be 3-80 characters');

  const startsOn = String(body.starts_on ?? '');
  if (!isCalendarDate(startsOn)) throw badRequest('starts_on must be a valid date (YYYY-MM-DD)');

  const deadline = new Date(String(body.signup_deadline ?? ''));
  if (isNaN(deadline.getTime())) throw badRequest('signup_deadline must be a date and time');

  let maxPlayers: number | null = null;
  if (body.max_players !== undefined && body.max_players !== null && body.max_players !== '') {
    maxPlayers = Number(body.max_players);
    if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 256) {
      throw badRequest('max_players must be between 2 and 256');
    }
  }

  return {
    name,
    starts_on: startsOn,
    signup_deadline: deadline,
    best_of: parseFormat(body.best_of ?? 3, 'best_of', false)!,
    quarters_best_of: parseFormat(body.quarters_best_of, 'quarters_best_of', true),
    semis_best_of: parseFormat(body.semis_best_of, 'semis_best_of', true),
    final_best_of: parseFormat(body.final_best_of, 'final_best_of', true),
    max_players: maxPlayers,
  };
}

// ───────────── Reads ─────────────

async function activeEntries(db: Queryable, tournamentId: number): Promise<EntryRow[]> {
  const { rows } = await db.query<EntryRow>(
    `SELECT e.user_id, e.joined_at, e.withdrawn_at, e.seed, e.rating_at_draw, u.display_name, u.email, u.rating
     FROM tournament_entries e JOIN users u ON u.id = e.user_id
     WHERE e.tournament_id = $1 AND e.withdrawn_at IS NULL
     ORDER BY e.joined_at, e.id`,
    [tournamentId]
  );
  return rows;
}

function summary(t: TournamentRow, entrantCount: number, entered: boolean) {
  return {
    id: t.id,
    name: t.name,
    starts_on: ymd(t.starts_on),
    signup_deadline: t.signup_deadline,
    best_of: t.best_of,
    quarters_best_of: t.quarters_best_of,
    semis_best_of: t.semis_best_of,
    final_best_of: t.final_best_of,
    max_players: t.max_players,
    status: t.status,
    drawn_at: t.drawn_at,
    completed_at: t.completed_at,
    winner_id: t.winner_id,
    entrant_count: entrantCount,
    entered,
    signup_open: t.status === 'signup' && new Date(t.signup_deadline).getTime() > Date.now(),
  };
}

export async function listTournaments(userId: number) {
  const { rows } = await query<TournamentRow>(`SELECT * FROM tournaments ORDER BY starts_on DESC, id DESC`);
  const entries = await query<{ tournament_id: number; user_id: number }>(
    `SELECT tournament_id, user_id FROM tournament_entries WHERE withdrawn_at IS NULL`
  );
  const winners = await query<{ id: number; display_name: string | null; email: string }>(
    `SELECT id, display_name, email FROM users WHERE id IN (SELECT winner_id FROM tournaments WHERE winner_id IS NOT NULL)`
  );
  const winnerName = new Map(winners.rows.map((u) => [u.id, displayName(u)]));
  return rows.map((t) => {
    const mine = entries.rows.filter((e) => e.tournament_id === t.id);
    return {
      ...summary(t, mine.length, mine.some((e) => e.user_id === userId)),
      winner_name: t.winner_id ? winnerName.get(t.winner_id) ?? null : null,
    };
  });
}

export async function getTournamentDetail(id: number, userId: number) {
  const t = await getTournament(pool, id);
  const entries = await activeEntries(pool, id);
  const userIds = entries.map((e) => e.user_id);
  const seedOf = new Map(entries.map((e) => [e.user_id, e.seed]));

  const tms = await query<TournamentMatchRow>(
    `SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY round, position`,
    [id]
  );
  // Players in the bracket who later withdrew/were removed are still shown by name.
  const bracketIds = tms.rows.flatMap((m) => [m.player1_id, m.player2_id]).filter((x): x is number => x != null);
  const allIds: number[] = [...new Set([...userIds, ...bracketIds, ...(t.winner_id ? [t.winner_id] : [])])];
  type UserLite = { id: number; display_name: string | null; email: string; rating: number };
  const userRows: UserLite[] =
    allIds.length > 0
      ? (
          await query<UserLite>(
            `SELECT id, display_name, email, rating FROM users WHERE id IN (${allIds.map((_, i) => `$${i + 1}`).join(',')})`,
            allIds
          )
        ).rows
      : [];
  const uMap = new Map<number, UserLite>(userRows.map((u): [number, UserLite] => [u.id, u]));
  const player = (uid: number | null) => {
    if (uid == null) return null;
    const u = uMap.get(uid)!;
    return { id: u.id, name: displayName(u), rating: u.rating, seed: seedOf.get(uid) ?? null };
  };

  // Results (confirmed) and in-flight submissions (pending) for bracket matches.
  const linked = await query<MatchRow>(
    `SELECT m.* FROM matches m JOIN tournament_matches tm ON tm.id = m.tournament_match_id
     WHERE tm.tournament_id = $1 AND m.status IN ('pending', 'confirmed')`,
    [id]
  );
  const hydrated = await hydrate(linked.rows);
  const rounds = tms.rows.length > 0 ? Math.max(...tms.rows.map((m) => m.round)) : 0;

  const roundList = [];
  for (let r = 1; r <= rounds; r++) {
    roundList.push({
      round: r,
      name: roundName(r, rounds),
      best_of: bestOfForRound(t, r, rounds),
      matches: tms.rows
        .filter((m) => m.round === r)
        .map((m) => ({
          id: m.id,
          round: m.round,
          position: m.position,
          status: m.status,
          player1: player(m.player1_id),
          player2: player(m.player2_id),
          winner_id: m.winner_id,
          result: hydrated.find((x) => x.id === m.match_id && x.status === 'confirmed') ?? null,
          pending: hydrated.find((x) => x.status === 'pending' && matchTmId(linked.rows, x.id) === m.id) ?? null,
        })),
    });
  }

  return {
    ...summary(t, entries.length, userIds.includes(userId)),
    winner: player(t.winner_id),
    entrants: entries.map((e) => ({
      id: e.user_id,
      name: displayName(e),
      rating: e.rating,
      seed: e.seed,
      joined_at: e.joined_at,
    })),
    rounds: roundList,
  };
}

function matchTmId(rows: MatchRow[], matchId: number): number | null {
  return rows.find((r) => r.id === matchId)?.tournament_match_id ?? null;
}

// ───────────── Admin: create / edit / cancel ─────────────

export async function createTournament(adminId: number, body: Record<string, unknown>) {
  const v = parseTournamentInput(body);
  const { rows } = await query<{ id: number }>(
    `INSERT INTO tournaments (name, starts_on, signup_deadline, best_of, quarters_best_of, semis_best_of, final_best_of, max_players, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [v.name, v.starts_on, v.signup_deadline, v.best_of, v.quarters_best_of, v.semis_best_of, v.final_best_of, v.max_players, adminId]
  );
  return getTournamentDetail(rows[0].id, adminId);
}

export async function updateTournament(adminId: number, id: number, body: Record<string, unknown>) {
  // Read, validate and write under the same tournament lock used by draw/cancel.
  await withTransaction(async (c) => {
    const t = await getTournament(c, id, true);
    if (t.status !== 'signup') throw conflict('Tournaments can only be edited before the bracket is drawn');
    const v = parseTournamentInput({ ...summary(t, 0, false), ...body });
    await c.query(
      `UPDATE tournaments SET name = $2, starts_on = $3, signup_deadline = $4, best_of = $5, quarters_best_of = $6,
         semis_best_of = $7, final_best_of = $8, max_players = $9 WHERE id = $1`,
      [id, v.name, v.starts_on, v.signup_deadline, v.best_of, v.quarters_best_of, v.semis_best_of, v.final_best_of, v.max_players]
    );
  });
  return getTournamentDetail(id, adminId);
}

export async function cancelTournament(adminId: number, id: number) {
  await withTransaction(async (c) => {
    const t = await getTournament(c, id, true);
    if (t.status === 'completed' || t.status === 'cancelled') throw conflict(`This tournament is already ${t.status}`);
    await c.query(`UPDATE tournaments SET status = 'cancelled' WHERE id = $1`, [id]);
    // Pending submissions for its matches are withdrawn; confirmed results (and ratings) stand.
    await c.query(
      `UPDATE matches SET status = 'withdrawn', awaiting_user_id = NULL
       WHERE status = 'pending' AND tournament_match_id IN (SELECT id FROM tournament_matches WHERE tournament_id = $1)`,
      [id]
    );
  });
  return getTournamentDetail(id, adminId);
}

// ───────────── Sign-up ─────────────

export async function signUp(userId: number, id: number) {
  await withTransaction(async (c) => {
    const t = await getTournament(c, id, true);
    if (t.status !== 'signup' || new Date(t.signup_deadline).getTime() <= Date.now()) {
      throw conflict('Sign-up for this tournament is closed');
    }
    const entries = await activeEntries(c, id);
    if (entries.some((e) => e.user_id === userId)) throw conflict("You're already signed up");
    if (t.max_players && entries.length >= t.max_players) throw conflict('This tournament is full');
    const existing = await c.query(`SELECT id FROM tournament_entries WHERE tournament_id = $1 AND user_id = $2`, [id, userId]);
    if (existing.rows.length > 0) {
      await c.query(
        `UPDATE tournament_entries SET withdrawn_at = NULL, joined_at = NOW() WHERE tournament_id = $1 AND user_id = $2`,
        [id, userId]
      );
    } else {
      await c.query(`INSERT INTO tournament_entries (tournament_id, user_id) VALUES ($1, $2)`, [id, userId]);
    }
  });
  return getTournamentDetail(id, userId);
}

async function removeEntry(id: number, targetUserId: number, byAdmin: boolean) {
  await withTransaction(async (c) => {
    const t = await getTournament(c, id, true);
    if (t.status !== 'signup') throw conflict('The bracket has already been drawn');
    if (!byAdmin && new Date(t.signup_deadline).getTime() <= Date.now()) {
      throw conflict('The sign-up deadline has passed');
    }
    const { rows } = await c.query(
      `UPDATE tournament_entries SET withdrawn_at = NOW()
       WHERE tournament_id = $1 AND user_id = $2 AND withdrawn_at IS NULL RETURNING id`,
      [id, targetUserId]
    );
    if (rows.length === 0) throw notFound('Not signed up');
  });
}

export async function withdrawEntry(userId: number, id: number) {
  await removeEntry(id, userId, false);
  return getTournamentDetail(id, userId);
}

export async function adminRemoveEntry(adminId: number, id: number, targetUserId: number) {
  await removeEntry(id, targetUserId, true);
  return getTournamentDetail(id, adminId);
}

// ───────────── Draw ─────────────

export async function generateBracket(adminId: number, id: number, rng: () => number = Math.random) {
  await withTransaction(async (c) => {
    const t = await getTournament(c, id, true);
    if (t.status !== 'signup') throw conflict('The bracket has already been drawn');
    if (new Date(t.signup_deadline).getTime() > Date.now()) {
      throw conflict('The bracket can be generated once the sign-up deadline has passed');
    }
    const entries = await activeEntries(c, id);
    if (entries.length < 2) throw conflict('At least 2 players are needed to generate the bracket');

    const slots = drawBracket(
      entries.map((e) => ({ userId: e.user_id, rating: e.rating, joinedAt: new Date(e.joined_at) })),
      rng
    );
    const size = slots.length;
    const rounds = totalRounds(size);

    for (const e of entries) {
      const slot = slots.find((s) => s?.userId === e.user_id)!;
      await c.query(`UPDATE tournament_entries SET seed = $3, rating_at_draw = $4 WHERE tournament_id = $1 AND user_id = $2`, [
        id,
        e.user_id,
        slot.seed,
        e.rating,
      ]);
    }

    // Create every bracket slot up front so the whole tree can be rendered.
    const firstRound: number[] = [];
    for (let r = 1; r <= rounds; r++) {
      const count = size / 2 ** r;
      for (let p = 0; p < count; p++) {
        const p1 = r === 1 ? slots[2 * p]?.userId ?? null : null;
        const p2 = r === 1 ? slots[2 * p + 1]?.userId ?? null : null;
        const status = r === 1 && p1 && p2 ? 'ready' : 'waiting';
        const ins = await c.query<{ id: number }>(
          `INSERT INTO tournament_matches (tournament_id, round, position, player1_id, player2_id, status)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [id, r, p, p1, p2, status]
        );
        if (r === 1) firstRound.push(ins.rows[0].id);
      }
    }

    await c.query(`UPDATE tournaments SET status = 'in_progress', drawn_at = NOW() WHERE id = $1`, [id]);

    // Byes: the lone player advances automatically.
    for (let p = 0; p < firstRound.length; p++) {
      const a = slots[2 * p];
      const b = slots[2 * p + 1];
      if (!a || !b) await recordBracketWinner(c, firstRound[p], (a ?? b)!.userId, 'bye', null);
    }
  });
  return getTournamentDetail(id, adminId);
}

// ───────────── Results ─────────────

/** Locks tournament then bracket match (see LOCK ORDER in bracketDb) and checks they belong together. */
async function openTournamentMatch(c: PoolClient, tournamentId: number, tmId: number) {
  const { t, tm } = await lockBracket(c, tmId);
  if (tm.tournament_id !== tournamentId) throw notFound('Match not found in this tournament');
  return { t, tm };
}

/** A player in a ready bracket match submits the result; the opponent confirms as usual. */
export async function submitResult(userId: number, tournamentId: number, tmId: number, body: Record<string, unknown>) {
  const created = await withTransaction(async (c) => {
    const { t, tm } = await openTournamentMatch(c, tournamentId, tmId);
    assertInProgress(t);
    if (tm.status !== 'ready') throw conflict('This match is not ready to be played');
    if (userId !== tm.player1_id && userId !== tm.player2_id) throw forbidden("You're not playing in this match");
    const pending = await c.query(`SELECT id FROM matches WHERE tournament_match_id = $1 AND status = 'pending'`, [tm.id]);
    if (pending.rows.length > 0) {
      throw conflict('A result is already waiting for confirmation. Confirm or correct it from your dashboard.');
    }
    const opponent = userId === tm.player1_id ? tm.player2_id! : tm.player1_id!;
    // The player's dialog may be stale (e.g. an admin override advanced a different opponent).
    if (body.expected_opponent_id === undefined) throw badRequest('expected_opponent_id is required');
    if (Number(body.expected_opponent_id) !== opponent) {
      throw conflict('Your opponent in this match has changed. Refresh the bracket and try again.');
    }
    const games = parseGames(body.games).map((g) => ({ a: g.me, b: g.them }));
    return insertMatch(c, {
      playerA: userId,
      playerB: opponent,
      submittedBy: userId,
      games,
      playedAt: parsePlayedAt(body.played_at),
      parentId: null,
      tournamentMatchId: tm.id,
      bestOf: await bestOfFor(c, tm),
    });
  });
  await notify(
    created.awaiting_user_id!,
    userId,
    '{from} recorded your tournament match',
    '{from} recorded the result of your tournament match. Please confirm or correct it:'
  );
  return (await hydrate([created]))[0];
}

/**
 * Admin sets the result directly (confirmed immediately, ratings updated) or awards a walkover
 * (no rating change). Overrides a decided match only if the next-round match hasn't started;
 * an overridden result is voided and its rating change reversed.
 */
export async function adminSetResult(adminId: number, tournamentId: number, tmId: number, body: Record<string, unknown>) {
  await withTransaction(async (c) => {
    const opened = await openTournamentMatch(c, tournamentId, tmId);
    let tm = opened.tm;
    // Admins may also fix results after completion (e.g. overriding the final), but not once cancelled.
    if (opened.t.status !== 'in_progress' && opened.t.status !== 'completed') {
      throw conflict(opened.t.status === 'cancelled' ? 'This tournament was cancelled' : 'The bracket has not been drawn yet');
    }
    if (tm.status === 'waiting') throw conflict('Both players must be known before setting a result');

    // The admin's dialog may be stale (e.g. another admin overrode a feeder match and swapped a player).
    // Require the participants they saw and compare under the bracket lock before changing anything.
    if (body.expected_player1_id === undefined || body.expected_player2_id === undefined) {
      throw badRequest('expected_player1_id and expected_player2_id are required');
    }
    if (Number(body.expected_player1_id) !== tm.player1_id || Number(body.expected_player2_id) !== tm.player2_id) {
      throw conflict('The players in this match have changed. Refresh the bracket and try again.');
    }
    if (tm.status === 'bye') throw conflict("Byes can't be changed");

    if (tm.status === 'completed' || tm.status === 'walkover') {
      if (tm.match_id) {
        const old = await getMatch(c, tm.match_id, true);
        if (old.status === 'confirmed') await voidConfirmed(c, old, 'Tournament result overridden');
      }
      await reopenBracketMatch(c, tm);
      tm = await getTournamentMatch(c, tm.id, true);
    }

    // Any player submission in flight is set aside.
    await c.query(
      `UPDATE matches SET status = 'superseded', awaiting_user_id = NULL WHERE tournament_match_id = $1 AND status = 'pending'`,
      [tm.id]
    );

    if (body.walkover !== undefined) {
      const winner = Number(body.walkover);
      if (winner !== tm.player1_id && winner !== tm.player2_id) throw badRequest('walkover must be one of the two players');
      await recordBracketWinner(c, tm.id, winner, 'walkover', null);
      return;
    }

    // Games are given from player 1's perspective: [{ p1, p2 }, ...]
    if (!Array.isArray(body.games)) throw badRequest('Provide games or walkover');
    const games = (body.games as { p1?: unknown; p2?: unknown }[]).map((g) => ({ a: Number(g?.p1), b: Number(g?.p2) }));
    const m = await insertMatch(c, {
      playerA: tm.player1_id!,
      playerB: tm.player2_id!,
      submittedBy: adminId,
      games,
      playedAt: parsePlayedAt(body.played_at),
      parentId: null,
      tournamentMatchId: tm.id,
      bestOf: await bestOfFor(c, tm),
    });
    await applyConfirmation(c, m);
  });
  return getTournamentDetail(tournamentId, adminId);
}
