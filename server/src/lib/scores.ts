/**
 * Strictly parses one raw score from a request body. Only non-negative integers (as JSON numbers or
 * digit-only strings) are accepted; anything else becomes NaN so validation rejects it.
 * Plain Number() would turn null, false, '' and [] into 0 and let malformed input count as a result.
 */
export function parseScore(raw: unknown): number {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 ? raw : NaN;
  if (typeof raw === 'string' && /^\d{1,3}$/.test(raw)) return Number(raw);
  return NaN;
}

/** Parses a raw games array, reading the two scores from the given keys (non-arrays yield no games). */
export function parseGamePairs<K extends string>(raw: unknown, k1: K, k2: K): { s1: number; s2: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((g) => {
    const obj = g !== null && typeof g === 'object' ? (g as Record<string, unknown>) : {};
    return { s1: parseScore(obj[k1]), s2: parseScore(obj[k2]) };
  });
}

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
 * A match is a single game, best of 3 or best of 5. It ends as soon as someone wins the majority,
 * so no games may be recorded after that. If `bestOf` is given (tournaments), the result must
 * match exactly that format.
 */
export function validateMatch(games: GameScore[], bestOf?: number): ScoreValidation {
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

  const winsNeeded = [1, 2, 3].find((w) => Math.max(aGames, bGames) === w);
  if (!winsNeeded) {
    return { ok: false, error: 'A match must be a single game, best of 3 (first to 2) or best of 5 (first to 3)' };
  }
  if (Math.min(aGames, bGames) >= winsNeeded) {
    return { ok: false, error: 'Invalid match result' };
  }
  if (bestOf !== undefined && winsNeeded !== (bestOf + 1) / 2) {
    return {
      ok: false,
      error: bestOf === 1 ? 'This match is a single game' : `This match is best of ${bestOf} (first to ${(bestOf + 1) / 2} games)`,
    };
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
