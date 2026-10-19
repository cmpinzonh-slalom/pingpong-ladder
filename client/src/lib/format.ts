import type { GameInput } from '../api/client';
import { summarize } from './scores';

export function formatLabel(bestOf: number): string {
  return bestOf === 1 ? 'Single game' : `Best of ${bestOf}`;
}

/** Validates games for a tournament match with a fixed format. Returns an error or null. */
export function formatError(games: GameInput[], bestOf: number): string | null {
  const s = summarize(games);
  if (!s.ok) return s.error;
  const winsNeeded = (bestOf + 1) / 2;
  if (Math.max(s.myGames, s.theirGames) !== winsNeeded) {
    return bestOf === 1 ? 'This match is a single game' : `This match is best of ${bestOf} (first to ${winsNeeded})`;
  }
  return null;
}
