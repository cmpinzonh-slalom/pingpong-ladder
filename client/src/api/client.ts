export interface Player {
  id: number;
  name: string;
  rating: number;
}

export interface Me {
  id: number;
  email: string;
  display_name: string | null;
  rating: number;
}

export interface LeaderboardRow extends Player {
  wins: number;
  losses: number;
  played: number;
}

export interface Profile extends LeaderboardRow {
  rank: number;
  created_at: string;
}

export interface Match {
  id: number;
  status: 'pending' | 'confirmed' | 'superseded' | 'withdrawn';
  played_at: string;
  created_at: string;
  confirmed_at: string | null;
  player_a: Player;
  player_b: Player;
  winner_id: number;
  submitted_by: number;
  awaiting_user_id: number | null;
  parent_match_id: number | null;
  games: { a: number; b: number }[];
  rating_a_before: number | null;
  rating_b_before: number | null;
  rating_a_after: number | null;
  rating_b_after: number | null;
}

export interface GameInput {
  me: number;
  them: number;
}

export interface HeadToHead {
  a: Player;
  b: Player;
  matches_played: number;
  a_wins: number;
  b_wins: number;
  a_games: number;
  b_games: number;
  a_points: number;
  b_points: number;
  matches: Match[];
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  requestLink: (email: string) => request<{ ok: true }>('POST', '/auth/request-link', { email }),
  verify: (token: string) => request<{ ok: true }>('POST', '/auth/verify', { token }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  me: () => request<Me>('GET', '/me'),
  updateMe: (display_name: string) => request<Me>('PATCH', '/me', { display_name }),

  users: () => request<LeaderboardRow[]>('GET', '/users'),
  user: (id: number) => request<Profile>('GET', `/users/${id}`),
  history: (id: number) => request<Match[]>('GET', `/users/${id}/history`),
  h2h: (a: number, b: number) => request<HeadToHead>('GET', `/h2h/${a}/${b}`),
  recent: () => request<Match[]>('GET', '/matches/recent'),

  pending: () => request<{ awaiting_me: Match[]; awaiting_them: Match[] }>('GET', '/matches/pending'),
  createMatch: (opponent_id: number, games: GameInput[], played_at?: string) =>
    request<Match>('POST', '/matches', { opponent_id, games, played_at }),
  confirm: (id: number) => request<Match>('POST', `/matches/${id}/confirm`),
  counter: (id: number, games: GameInput[]) => request<Match>('POST', `/matches/${id}/counter`, { games }),
  withdraw: (id: number) => request<Match>('POST', `/matches/${id}/withdraw`),
};

/** Perspective helpers. */
export function sideOf(m: Match, userId: number): 'a' | 'b' {
  return m.player_a.id === userId ? 'a' : 'b';
}

export function opponentOf(m: Match, userId: number): Player {
  return m.player_a.id === userId ? m.player_b : m.player_a;
}

export function gamesFor(m: Match, userId: number): GameInput[] {
  const s = sideOf(m, userId);
  return m.games.map((g) => (s === 'a' ? { me: g.a, them: g.b } : { me: g.b, them: g.a }));
}

export function ratingChange(m: Match, userId: number): number | null {
  const s = sideOf(m, userId);
  const before = s === 'a' ? m.rating_a_before : m.rating_b_before;
  const after = s === 'a' ? m.rating_a_after : m.rating_b_after;
  return before == null || after == null ? null : after - before;
}

export function scoreLine(m: Match, userId?: number): string {
  if (userId !== undefined && (m.player_a.id === userId || m.player_b.id === userId)) {
    return gamesFor(m, userId).map((g) => `${g.me}-${g.them}`).join(', ');
  }
  return m.games.map((g) => `${g.a}-${g.b}`).join(', ');
}
