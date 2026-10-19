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
  is_admin: boolean;
  is_owner: boolean;
  must_change_password: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string | null;
  rating: number;
  has_password: boolean;
  must_change_password: boolean;
  is_admin: boolean;
  is_owner: boolean;
  created_at: string;
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
  /** Set for tournament matches; best_of is the round's required format. */
  tournament: { id: number; name: string; round_name: string; best_of: number } | null;
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

export type TournamentStatus = 'signup' | 'in_progress' | 'completed' | 'cancelled';

export interface TournamentInput {
  name: string;
  starts_on: string;
  signup_deadline: string;
  best_of: number;
  quarters_best_of: number | null;
  semis_best_of: number | null;
  final_best_of: number | null;
  max_players: number | null;
}

export interface TournamentSummary extends Omit<TournamentInput, 'signup_deadline'> {
  id: number;
  signup_deadline: string;
  status: TournamentStatus;
  drawn_at: string | null;
  completed_at: string | null;
  winner_id: number | null;
  winner_name?: string | null;
  entrant_count: number;
  entered: boolean;
  signup_open: boolean;
}

export interface BracketPlayer extends Player {
  seed: number | null;
}

export interface BracketMatch {
  id: number;
  round: number;
  position: number;
  status: 'waiting' | 'ready' | 'completed' | 'bye' | 'walkover';
  player1: BracketPlayer | null;
  player2: BracketPlayer | null;
  winner_id: number | null;
  result: Match | null;
  pending: Match | null;
}

export interface BracketRound {
  round: number;
  name: string;
  best_of: number;
  matches: BracketMatch[];
}

export interface TournamentDetail extends TournamentSummary {
  winner: BracketPlayer | null;
  entrants: (Player & { seed: number | null; joined_at: string })[];
  rounds: BracketRound[];
}

export interface RatingHistory {
  current: number;
  start: number;
  points: { at: string; rating_before: number; rating: number; kind: 'match' | 'adjustment'; label: string }[];
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
  register: (email: string, password: string, display_name: string) =>
    request<Me>('POST', '/auth/register', { email, password, display_name }),
  login: (email: string, password: string) => request<Me>('POST', '/auth/login', { email, password }),
  changePassword: (new_password: string, current_password?: string) =>
    request<Me>('POST', '/me/password', { new_password, current_password }),
  logout: () => request<{ ok: true }>('POST', '/auth/logout'),
  me: () => request<Me>('GET', '/me'),
  updateMe: (display_name: string) => request<Me>('PATCH', '/me', { display_name }),

  adminUsers: () => request<AdminUser[]>('GET', '/admin/users'),
  adminResetPassword: (id: number) =>
    request<{ email: string; temporary_password: string }>('POST', `/admin/users/${id}/reset-password`),
  setAdmin: (id: number, admin: boolean) =>
    request<{ id: number; is_admin: boolean }>('POST', `/admin/users/${id}/admin`, { admin }),

  tournaments: () => request<TournamentSummary[]>('GET', '/tournaments'),
  tournament: (id: number) => request<TournamentDetail>('GET', `/tournaments/${id}`),
  createTournament: (body: TournamentInput) => request<TournamentDetail>('POST', '/tournaments', body),
  updateTournament: (id: number, body: Partial<TournamentInput>) =>
    request<TournamentDetail>('PATCH', `/tournaments/${id}`, body),
  cancelTournament: (id: number) => request<TournamentDetail>('POST', `/tournaments/${id}/cancel`),
  tournamentSignup: (id: number) => request<TournamentDetail>('POST', `/tournaments/${id}/signup`),
  tournamentWithdraw: (id: number) => request<TournamentDetail>('POST', `/tournaments/${id}/withdraw`),
  removeEntrant: (id: number, userId: number) =>
    request<TournamentDetail>('DELETE', `/tournaments/${id}/entries/${userId}`),
  generateBracket: (id: number) => request<TournamentDetail>('POST', `/tournaments/${id}/generate`),
  /** expectedOpponentId: the opponent shown to the player; the server rejects the result if it changed. */
  submitTournamentResult: (id: number, tmId: number, expectedOpponentId: number, games: GameInput[], played_at?: string) =>
    request<Match>('POST', `/tournaments/${id}/matches/${tmId}/result`, {
      games,
      played_at,
      expected_opponent_id: expectedOpponentId,
    }),
  adminTournamentResult: (
    id: number,
    tmId: number,
    body: ({ games: { p1: number; p2: number }[] } | { walkover: number }) & {
      /** Players the admin saw; the server rejects the change if the bracket has moved on. */
      expected_player1_id: number;
      expected_player2_id: number;
    }
  ) => request<TournamentDetail>('POST', `/tournaments/${id}/matches/${tmId}/admin-result`, body),

  users: () => request<LeaderboardRow[]>('GET', '/users'),
  user: (id: number) => request<Profile>('GET', `/users/${id}`),
  history: (id: number) => request<Match[]>('GET', `/users/${id}/history`),
  ratingHistory: (id: number) => request<RatingHistory>('GET', `/users/${id}/rating-history`),
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
