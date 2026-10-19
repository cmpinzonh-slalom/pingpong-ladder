import { Router } from 'express';
import { query } from '../db/database';
import { badRequest, notFound } from '../lib/errors';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { confirmedMatchesFor, displayName, recentConfirmed } from '../services/matches';

const router = Router();
router.use(requireAuth);

interface UserRow {
  id: number;
  email: string;
  display_name: string | null;
  rating: number;
  created_at: Date;
}

async function winLossMap(): Promise<Map<number, { wins: number; losses: number }>> {
  const { rows } = await query<{ player_a_id: number; player_b_id: number; winner_id: number }>(
    `SELECT player_a_id, player_b_id, winner_id FROM matches WHERE status = 'confirmed'`
  );
  const map = new Map<number, { wins: number; losses: number }>();
  const get = (id: number) => {
    if (!map.has(id)) map.set(id, { wins: 0, losses: 0 });
    return map.get(id)!;
  };
  for (const r of rows) {
    const loser = r.winner_id === r.player_a_id ? r.player_b_id : r.player_a_id;
    get(r.winner_id).wins++;
    get(loser).losses++;
  }
  return map;
}

/** Leaderboard / opponent picker. */
router.get('/users', async (_req, res) => {
  const { rows } = await query<UserRow>(`SELECT id, email, display_name, rating, created_at FROM users ORDER BY rating DESC, id`);
  const wl = await winLossMap();
  res.json(
    rows.map((u) => {
      const s = wl.get(u.id) || { wins: 0, losses: 0 };
      return { id: u.id, name: displayName(u), rating: u.rating, wins: s.wins, losses: s.losses, played: s.wins + s.losses };
    })
  );
});

router.get('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('Invalid id');
  const { rows } = await query<UserRow>(`SELECT id, email, display_name, rating, created_at FROM users WHERE id = $1`, [id]);
  if (rows.length === 0) throw notFound('Player not found');
  const u = rows[0];
  const s = (await winLossMap()).get(id) || { wins: 0, losses: 0 };
  const rank = await query<{ c: string }>(`SELECT COUNT(*) AS c FROM users WHERE rating > $1`, [u.rating]);
  res.json({
    id: u.id,
    name: displayName(u),
    rating: u.rating,
    wins: s.wins,
    losses: s.losses,
    played: s.wins + s.losses,
    rank: Number(rank.rows[0].c) + 1,
    created_at: u.created_at,
  });
});

/** Confirmed matches for a player, newest first. Each includes the player's rating before/after. */
router.get('/users/:id/history', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('Invalid id');
  res.json(await confirmedMatchesFor(id));
});

/**
 * Every rating change for a player in chronological order: confirmed matches plus adjustments
 * (e.g. reversals of overridden tournament results). The last point always equals the current rating.
 */
router.get('/users/:id/rating-history', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('Invalid id');
  const user = await query<{ rating: number }>(`SELECT rating FROM users WHERE id = $1`, [id]);
  if (user.rows.length === 0) throw notFound('Player not found');

  const matches = await query<{
    id: number;
    confirmed_at: Date;
    rating_seq: string | number | null;
    player_a_id: number;
    player_b_id: number;
    winner_id: number;
    rating_a_before: number;
    rating_b_before: number;
    rating_a_after: number;
    rating_b_after: number;
  }>(
    `SELECT id, confirmed_at, rating_seq, player_a_id, player_b_id, winner_id,
            rating_a_before, rating_b_before, rating_a_after, rating_b_after
     FROM matches WHERE status IN ('confirmed', 'voided') AND confirmed_at IS NOT NULL
       AND (player_a_id = $1 OR player_b_id = $1)`,
    [id]
  );
  const adjustments = await query<{
    id: number;
    created_at: Date;
    rating_seq: string | number | null;
    rating_before: number;
    rating_after: number;
    reason: string;
  }>(
    `SELECT id, created_at, rating_seq, rating_before, rating_after, reason FROM rating_adjustments WHERE user_id = $1`,
    [id]
  );
  const oppIds = [...new Set(matches.rows.map((m) => (m.player_a_id === id ? m.player_b_id : m.player_a_id)))];
  const opps =
    oppIds.length > 0
      ? await query<{ id: number; display_name: string | null; email: string }>(
          `SELECT id, display_name, email FROM users WHERE id IN (${oppIds.map((_, i) => `$${i + 1}`).join(',')})`,
          oppIds
        )
      : { rows: [] as { id: number; display_name: string | null; email: string }[] };
  const oppName = new Map(opps.rows.map((u) => [u.id, displayName(u)]));

  // Voided matches stay in the history at the time they happened; their reversal appears as an adjustment later.
  type Point = {
    at: Date;
    seq: number | null;
    rating_before: number;
    rating: number;
    kind: 'match' | 'adjustment';
    label: string;
  };
  const points: Point[] = [
    ...matches.rows.map((m): Point => {
      const isA = m.player_a_id === id;
      const opp = isA ? m.player_b_id : m.player_a_id;
      return {
        at: new Date(m.confirmed_at),
        seq: m.rating_seq == null ? null : Number(m.rating_seq),
        rating_before: isA ? m.rating_a_before : m.rating_b_before,
        rating: isA ? m.rating_a_after : m.rating_b_after,
        kind: 'match',
        label: `${m.winner_id === id ? 'Won' : 'Lost'} vs ${oppName.get(opp) ?? 'unknown'}`,
      };
    }),
    ...adjustments.rows.map(
      (a): Point => ({
        at: new Date(a.created_at),
        seq: a.rating_seq == null ? null : Number(a.rating_seq),
        rating_before: a.rating_before,
        rating: a.rating_after,
        kind: 'adjustment',
        label: a.reason,
      })
    ),
  ]
    // Order by when each change was applied (rating_seq); timestamps can tie within one transaction.
    // Rows from before the sequence existed have no seq; they all predate sequenced rows.
    .sort((x, y) => {
      if (x.seq !== null && y.seq !== null) return x.seq - y.seq;
      if (x.seq === null && y.seq === null) return x.at.getTime() - y.at.getTime();
      return x.seq === null ? -1 : 1;
    });

  res.json({
    current: user.rows[0].rating,
    start: points.length > 0 ? points[0].rating_before : user.rows[0].rating,
    points,
  });
});

router.get('/matches/recent', async (_req, res) => {
  res.json(await recentConfirmed(20));
});

router.get('/h2h/:a/:b', async (req: AuthedRequest, res) => {
  const a = Number(req.params.a);
  const b = Number(req.params.b);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) throw badRequest('Invalid players');
  const users = await query<UserRow>(`SELECT id, email, display_name, rating, created_at FROM users WHERE id IN ($1, $2)`, [a, b]);
  if (users.rows.length !== 2) throw notFound('Player not found');
  const ua = users.rows.find((u) => u.id === a)!;
  const ub = users.rows.find((u) => u.id === b)!;

  const matches = await confirmedMatchesFor(a, b);
  let aWins = 0;
  let aGames = 0;
  let bGames = 0;
  let aPoints = 0;
  let bPoints = 0;
  for (const m of matches) {
    if (m.winner_id === a) aWins++;
    const aIsA = m.player_a.id === a;
    for (const g of m.games) {
      const pa = aIsA ? g.a : g.b;
      const pb = aIsA ? g.b : g.a;
      aPoints += pa;
      bPoints += pb;
      if (pa > pb) aGames++;
      else bGames++;
    }
  }
  res.json({
    a: { id: ua.id, name: displayName(ua), rating: ua.rating },
    b: { id: ub.id, name: displayName(ub), rating: ub.rating },
    matches_played: matches.length,
    a_wins: aWins,
    b_wins: matches.length - aWins,
    a_games: aGames,
    b_games: bGames,
    a_points: aPoints,
    b_points: bPoints,
    matches,
  });
});

export default router;
