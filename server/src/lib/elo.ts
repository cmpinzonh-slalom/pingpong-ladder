import { K_FACTOR } from '../config';

/** Probability that a player rated `ra` beats a player rated `rb`. */
export function expectedScore(ra: number, rb: number): number {
  return 1 / (1 + Math.pow(10, (rb - ra) / 400));
}

/**
 * Returns new ratings after a match. Zero-sum: whatever A gains, B loses.
 * `aWon` is true if player A won.
 */
export function applyElo(
  ra: number,
  rb: number,
  aWon: boolean,
  k: number = K_FACTOR
): { newA: number; newB: number; delta: number } {
  const ea = expectedScore(ra, rb);
  const delta = Math.round(k * ((aWon ? 1 : 0) - ea));
  return { newA: ra + delta, newB: rb - delta, delta };
}
