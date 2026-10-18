import { PoolClient } from 'pg';
import { config } from '../config';
import { query, Queryable, withTransaction } from '../db/database';
import { applyElo } from '../lib/elo';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { sendMail } from '../lib/mailer';
import { GameScore, validateMatch } from '../lib/scores';

/** Game score from the caller's point of view. */
export interface PerspectiveGame {
  me: number;
  them: number;
}

interface MatchRow {
  id: number;
  player_a_id: number;
  player_b_id: number;
  submitted_by: number;
  awaiting_user_id: number | null;
  winner_id: number;
  status: string;
  parent_match_id: number | null;
  played_at: Date;
  created_at: Date;
  confirmed_at: Date | null;
  rating_a_before: number | null;
  rating_b_before: number | null;
  rating_a_after: number | null;
  rating_b_after: number | null;
}

interface UserLite {
  id: number;
  display_name: string | null;
  email: string;
  rating: number;
}

export function displayName(u: { display_name: string | null; email: string }): string {
  return u.display_name || u.email.split('@')[0];
}

/** Load matches with players and games, serialized for the API. */
export async function hydrate(rows: MatchRow[], db: Queryable = { query } as Queryable) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const userIds = [...new Set(rows.flatMap((r) => [r.player_a_id, r.player_b_id]))];
  const ph = (arr: unknown[]) => arr.map((_, i) => `$${i + 1}`).join(',');

  const games = await db.query<{ match_id: number; game_no: number; score_a: number; score_b: number }>(
    `SELECT match_id, game_no, score_a, score_b FROM match_games WHERE match_id IN (${ph(ids)}) ORDER BY match_id, game_no`,
    ids
  );
  const users = await db.query<UserLite>(
    `SELECT id, display_name, email, rating FROM users WHERE id IN (${ph(userIds)})`,
    userIds
  );
  const uMap = new Map(users.rows.map((u) => [u.id, u]));
  const player = (id: number) => {
    const u = uMap.get(id)!;
    return { id: u.id, name: displayName(u), rating: u.rating };
  };

  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    played_at: r.played_at,
    created_at: r.created_at,
    confirmed_at: r.confirmed_at,
    player_a: player(r.player_a_id),
    player_b: player(r.player_b_id),
    winner_id: r.winner_id,
    submitted_by: r.submitted_by,
    awaiting_user_id: r.awaiting_user_id,
    parent_match_id: r.parent_match_id,
    games: games.rows.filter((g) => g.match_id === r.id).map((g) => ({ a: g.score_a, b: g.score_b })),
    rating_a_before: r.rating_a_before,
    rating_b_before: r.rating_b_before,
    rating_a_after: r.rating_a_after,
    rating_b_after: r.rating_b_after,
  }));
}

function parseGames(raw: unknown): PerspectiveGame[] {
  if (!Array.isArray(raw)) throw badRequest('games must be an array');
  return raw.map((g) => ({ me: Number(g?.me), them: Number(g?.them) }));
}

function parsePlayedAt(raw: unknown): Date {
  if (raw === undefined || raw === null || raw === '') return new Date();
  const d = new Date(String(raw));
  if (isNaN(d.getTime())) throw badRequest('Invalid played_at date');
  if (d.getTime() > Date.now() + 60 * 60 * 1000) throw badRequest('Match date cannot be in the future');
  return d;
}

async function getMatch(db: Queryable, id: number, lock = false): Promise<MatchRow> {
  const { rows } = await db.query<MatchRow>(
    `SELECT * FROM matches WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [id]
  );
  if (rows.length === 0) throw notFound('Match not found');
  return rows[0];
}

async function insertMatch(
  client: PoolClient,
  opts: {
    playerA: number;
    playerB: number;
    submittedBy: number;
    games: GameScore[];
    playedAt: Date;
    parentId: number | null;
  }
): Promise<MatchRow> {
  const v = validateMatch(opts.games);
  if (!v.ok) throw badRequest(v.error);
  const winner = v.aWon ? opts.playerA : opts.playerB;
  const awaiting = opts.submittedBy === opts.playerA ? opts.playerB : opts.playerA;

  const { rows } = await client.query<MatchRow>(
    `INSERT INTO matches (player_a_id, player_b_id, submitted_by, awaiting_user_id, winner_id, status, parent_match_id, played_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7) RETURNING *`,
    [opts.playerA, opts.playerB, opts.submittedBy, awaiting, winner, opts.parentId, opts.playedAt]
  );
  const m = rows[0];
  for (let i = 0; i < opts.games.length; i++) {
    await client.query(`INSERT INTO match_games (match_id, game_no, score_a, score_b) VALUES ($1, $2, $3, $4)`, [
      m.id,
      i + 1,
      opts.games[i].a,
      opts.games[i].b,
    ]);
  }
  return m;
}

async function notify(toUserId: number, fromUserId: number, subject: string, body: string): Promise<void> {
  try {
    const { rows } = await query<UserLite>(`SELECT id, email, display_name, rating FROM users WHERE id IN ($1, $2)`, [
      toUserId,
      fromUserId,
    ]);
    const to = rows.find((u) => u.id === toUserId);
    const from = rows.find((u) => u.id === fromUserId);
    if (!to || !from) return;
    // Don't email seeded test accounts.
    if (to.email.startsWith('test.')) return;
    await sendMail({
      to: to.email,
      subject: subject.replace('{from}', displayName(from)),
      text: `${body.replace('{from}', displayName(from))}\n\n${config.appUrl}/`,
    });
  } catch (err) {
    console.error('[notify] failed to send email', err);
  }
}

export async function createMatch(userId: number, body: Record<string, unknown>) {
  const opponentId = Number(body.opponent_id);
  if (!Number.isInteger(opponentId)) throw badRequest('opponent_id is required');
  if (opponentId === userId) throw badRequest('You cannot play against yourself');
  const opp = await query(`SELECT id FROM users WHERE id = $1`, [opponentId]);
  if (opp.rows.length === 0) throw notFound('Opponent not found');

  const games = parseGames(body.games).map((g) => ({ a: g.me, b: g.them }));
  const playedAt = parsePlayedAt(body.played_at);

  const m = await withTransaction((c) =>
    insertMatch(c, { playerA: userId, playerB: opponentId, submittedBy: userId, games, playedAt, parentId: null })
  );
  await notify(opponentId, userId, '{from} recorded a ping pong match with you', '{from} recorded a match result against you. Please confirm or correct it:');
  return (await hydrate([m]))[0];
}

export async function counterMatch(userId: number, matchId: number, body: Record<string, unknown>) {
  const created = await withTransaction(async (c) => {
    const old = await getMatch(c, matchId, true);
    if (old.status !== 'pending') throw conflict('This match is no longer pending');
    if (old.awaiting_user_id !== userId) throw forbidden('This match is not waiting on you');

    const isA = old.player_a_id === userId;
    const games = parseGames(body.games).map((g) => (isA ? { a: g.me, b: g.them } : { a: g.them, b: g.me }));
    const playedAt = body.played_at ? parsePlayedAt(body.played_at) : old.played_at;

    await c.query(`UPDATE matches SET status = 'superseded', awaiting_user_id = NULL WHERE id = $1`, [old.id]);
    return insertMatch(c, {
      playerA: old.player_a_id,
      playerB: old.player_b_id,
      submittedBy: userId,
      games,
      playedAt,
      parentId: old.id,
    });
  });
  await notify(created.awaiting_user_id!, userId, '{from} corrected your ping pong match result', '{from} proposed a different result for your match. Please review it:');
  return (await hydrate([created]))[0];
}

export async function confirmMatch(userId: number, matchId: number) {
  const confirmed = await withTransaction(async (c) => {
    const m = await getMatch(c, matchId, true);
    if (m.status !== 'pending') throw conflict('This match is no longer pending');
    if (m.awaiting_user_id !== userId) throw forbidden('Only the opponent can confirm this result');

    const players = await c.query<{ id: number; rating: number }>(
      `SELECT id, rating FROM users WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`,
      [m.player_a_id, m.player_b_id]
    );
    const ra = players.rows.find((p) => p.id === m.player_a_id)!.rating;
    const rb = players.rows.find((p) => p.id === m.player_b_id)!.rating;
    const { newA, newB } = applyElo(ra, rb, m.winner_id === m.player_a_id);

    // Guard against double-confirm races: only one UPDATE can flip pending -> confirmed.
    const upd = await c.query<MatchRow>(
      `UPDATE matches SET status = 'confirmed', awaiting_user_id = NULL, confirmed_at = NOW(),
         rating_a_before = $2, rating_b_before = $3, rating_a_after = $4, rating_b_after = $5
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [m.id, ra, rb, newA, newB]
    );
    if (upd.rows.length === 0) throw conflict('This match is no longer pending');
    await c.query(`UPDATE users SET rating = $1 WHERE id = $2`, [newA, m.player_a_id]);
    await c.query(`UPDATE users SET rating = $1 WHERE id = $2`, [newB, m.player_b_id]);
    return upd.rows[0];
  });
  return (await hydrate([confirmed]))[0];
}

export async function withdrawMatch(userId: number, matchId: number) {
  const m = await getMatch({ query } as Queryable, matchId);
  if (m.player_a_id !== userId && m.player_b_id !== userId) throw forbidden('Not your match');
  if (m.status !== 'pending') throw conflict('Only pending matches can be withdrawn');
  const { rows } = await query<MatchRow>(
    `UPDATE matches SET status = 'withdrawn', awaiting_user_id = NULL WHERE id = $1 AND status = 'pending' RETURNING *`,
    [matchId]
  );
  if (rows.length === 0) throw conflict('Only pending matches can be withdrawn');
  return (await hydrate(rows))[0];
}

export async function pendingFor(userId: number) {
  const { rows } = await query<MatchRow>(
    `SELECT * FROM matches WHERE status = 'pending' AND (player_a_id = $1 OR player_b_id = $1) ORDER BY created_at DESC`,
    [userId]
  );
  const all = await hydrate(rows);
  return {
    awaiting_me: all.filter((m) => m.awaiting_user_id === userId),
    awaiting_them: all.filter((m) => m.awaiting_user_id !== userId),
  };
}

export async function confirmedMatchesFor(userId: number, opponentId?: number) {
  const params: unknown[] = [userId];
  let where = `status = 'confirmed' AND (player_a_id = $1 OR player_b_id = $1)`;
  if (opponentId !== undefined) {
    params.push(opponentId);
    where += ` AND (player_a_id = $2 OR player_b_id = $2)`;
  }
  const { rows } = await query<MatchRow>(
    `SELECT * FROM matches WHERE ${where} ORDER BY confirmed_at DESC, id DESC`,
    params
  );
  return hydrate(rows);
}

export async function recentConfirmed(limit = 20) {
  const { rows } = await query<MatchRow>(
    `SELECT * FROM matches WHERE status = 'confirmed' ORDER BY confirmed_at DESC, id DESC LIMIT $1`,
    [limit]
  );
  return hydrate(rows);
}
