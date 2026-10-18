export interface GameScore {
  a: number;
  b: number;
}

export type ScoreValidation =
  | { ok: true; aGames: number; bGames: number; aWon: boolean }
  | { ok: false; error: string };

/** A single game: first to 11, win by 2 (deuce continues until a 2-point lead). */
export function validateGame(g: GameScore): string | null {
  const { a, b } = g;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return 'Scores must be non-negative whole numbers';
  }
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < 11) return 'The winner of a game must reach at least 11 points';
  if (hi - lo < 2) return 'A game must be won by at least 2 points';
  if (hi > 11 && hi - lo !== 2) return 'Past 10-10, a game ends as soon as someone leads by 2';
  return null;
}

/**
 * A match is best of 3 or best of 5. It ends as soon as someone wins the majority,
 * so no games may be recorded after that.
 */
export function validateMatch(games: GameScore[]): ScoreValidation {
  if (!Array.isArray(games) || games.length === 0) {
    return { ok: false, error: 'Enter at least one game' };
  }
  if (games.length > 5) return { ok: false, error: 'A match has at most 5 games' };

  let aGames = 0;
  let bGames = 0;
  for (let i = 0; i < games.length; i++) {
    const err = validateGame(games[i]);
    if (err) return { ok: false, error: `Game ${i + 1}: ${err}` };
    if (games[i].a > games[i].b) aGames++;
    else bGames++;
  }

  const winsNeeded = [2, 3].find((w) => Math.max(aGames, bGames) === w);
  if (!winsNeeded) {
    return { ok: false, error: 'A match must be best of 3 (first to 2) or best of 5 (first to 3)' };
  }
  if (Math.min(aGames, bGames) >= winsNeeded) {
    return { ok: false, error: 'Invalid match result' };
  }
  // Best of 3 only allows up to 3 games; best of 5 up to 5. Already implied by the counts above.
  // Ensure the match ended exactly when the winner reached the required wins (no extra games).
  let ra = 0;
  let rb = 0;
  for (let i = 0; i < games.length; i++) {
    if (games[i].a > games[i].b) ra++;
    else rb++;
    if ((ra === winsNeeded || rb === winsNeeded) && i !== games.length - 1) {
      return { ok: false, error: 'Games were recorded after the match was already decided' };
    }
  }

  return { ok: true, aGames, bGames, aWon: aGames > bGames };
}
