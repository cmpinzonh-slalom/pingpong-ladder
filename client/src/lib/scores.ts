// Mirror of server/src/lib/scores.ts for instant feedback. The server remains the source of truth.
import type { GameInput } from '../api/client';

export function validateGame(g: GameInput): string | null {
  const { me: a, them: b } = g;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Enter both scores';
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < 11) return 'Winner needs at least 11 points';
  if (hi - lo < 2) return 'Must win by 2';
  if (hi > 11 && hi - lo !== 2) return 'Past 10-10, the game ends at a 2-point lead';
  return null;
}

export type MatchSummary =
  | { ok: true; myGames: number; theirGames: number; iWon: boolean }
  | { ok: false; error: string };

export function summarize(games: GameInput[]): MatchSummary {
  if (games.length === 0) return { ok: false, error: 'Enter at least one game' };
  if (games.length > 5) return { ok: false, error: 'A match has at most 5 games' };

  let me = 0;
  let them = 0;
  for (let i = 0; i < games.length; i++) {
    const err = validateGame(games[i]);
    if (err) return { ok: false, error: `Game ${i + 1}: ${err}` };
    if (games[i].me > games[i].them) me++;
    else them++;
  }

  const hi = Math.max(me, them);
  const winsNeeded = hi >= 1 && hi <= 3 ? hi : null;
  if (!winsNeeded || Math.min(me, them) >= winsNeeded) {
    return { ok: false, error: 'Match must be a single game, best of 3 (first to 2) or best of 5 (first to 3)' };
  }

  let a = 0;
  let b = 0;
  for (let i = 0; i < games.length; i++) {
    if (games[i].me > games[i].them) a++;
    else b++;
    if ((a === winsNeeded || b === winsNeeded) && i !== games.length - 1) {
      return { ok: false, error: 'Games recorded after the match was already decided' };
    }
  }
  return { ok: true, myGames: me, theirGames: them, iWon: me > them };
}
