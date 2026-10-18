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
