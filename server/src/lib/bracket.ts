/**
 * Single-elimination bracket helpers (pure functions, no DB).
 *
 * Seeding follows the standard tennis layout: seeds 1 and 2 are in opposite halves,
 * seeds 3-4 in the remaining quarters, 5-8 in the remaining eighths, etc. Like tennis,
 * which seed of a tier (3-4, 5-8, 9-16) lands in which of that tier's spots is random.
 * Byes go to the strongest ranks, so a bye always faces a real player.
 */

export type Rng = () => number;

export interface DrawEntrant {
  userId: number;
  rating: number;
  joinedAt: Date;
}

export interface DrawSlot {
  userId: number;
  seed: number | null;
}

export function nextPowerOfTwo(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

export function totalRounds(bracketSize: number): number {
  return Math.round(Math.log2(bracketSize));
}

/** Number of seeds for a bracket of this size (capped by the number of players). */
export function seedCount(bracketSize: number, players: number): number {
  const s = bracketSize <= 8 ? 2 : bracketSize <= 16 ? 4 : bracketSize <= 32 ? 8 : 16;
  return Math.min(s, players);
}

/**
 * Standard seeding order: element i is the rank placed in slot i.
 * size 8 -> [1, 8, 4, 5, 2, 7, 3, 6]. In round 1, rank r always meets rank size + 1 - r.
 */
export function seedingOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((r) => [r, n + 1 - r]);
  }
  return order;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Highest rating first; ties go to whoever signed up first. */
export function rankEntrants(entrants: DrawEntrant[]): DrawEntrant[] {
  return [...entrants].sort((a, b) => b.rating - a.rating || a.joinedAt.getTime() - b.joinedAt.getTime());
}

/**
 * Returns the first-round slots (length = bracket size). `null` is a bye.
 * Slots 2k and 2k+1 play each other in round 1.
 */
export function drawBracket(entrants: DrawEntrant[], rng: Rng = Math.random): (DrawSlot | null)[] {
  if (entrants.length < 2) throw new Error('At least 2 players are needed');
  const ranked = rankEntrants(entrants);
  const n = ranked.length;
  const size = nextPowerOfTwo(n);
  const byes = size - n;
  const seeds = seedCount(size, n);

  // rank -> entrant (or null for a bye)
  const byRank = new Map<number, DrawSlot | null>();

  // Seeds: within each tier, randomly assign which seed takes which rank position.
  const tiers: [number, number][] = [
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [9, 16],
  ];
  for (const [lo, hi] of tiers) {
    const ranks: number[] = [];
    for (let r = lo; r <= Math.min(hi, seeds); r++) ranks.push(r);
    const shuffledRanks = shuffle(ranks, rng);
    ranks.forEach((seedNo, i) => {
      byRank.set(shuffledRanks[i], { userId: ranked[seedNo - 1].userId, seed: seedNo });
    });
  }

  // Byes go to seeds in seed order (seed 1 first). Since round 1 pairs rank r with
  // rank size+1-r, the bye sits opposite the rank that seed was placed at.
  const rankOfSeed = new Map<number, number>();
  byRank.forEach((slot, rank) => slot?.seed && rankOfSeed.set(slot.seed, rank));
  for (let s = 1; s <= Math.min(byes, seeds); s++) byRank.set(size + 1 - rankOfSeed.get(s)!, null);

  // If there are more byes than seeds, the next-highest-rated players also get byes
  // (ranks seeds+1..byes face a bye), placed at random among those spots.
  const extraByeRanks: number[] = [];
  for (let r = seeds + 1; r <= byes; r++) extraByeRanks.push(r);
  extraByeRanks.forEach((r) => byRank.set(size + 1 - r, null));
  const extraByePlayers = shuffle(ranked.slice(seeds, seeds + extraByeRanks.length), rng);
  extraByeRanks.forEach((r, i) => byRank.set(r, { userId: extraByePlayers[i].userId, seed: null }));

  // Everyone else is placed at random in the remaining ranks.
  const openRanks: number[] = [];
  for (let r = 1; r <= size; r++) if (!byRank.has(r)) openRanks.push(r);
  const unseeded = shuffle(ranked.slice(seeds + extraByeRanks.length), rng);
  openRanks.forEach((r, i) => byRank.set(r, { userId: unseeded[i].userId, seed: null }));

  return seedingOrder(size).map((r) => byRank.get(r) ?? null);
}

export interface RoundFormats {
  best_of: number;
  quarters_best_of: number | null;
  semis_best_of: number | null;
  final_best_of: number | null;
}

/** Format for a round, applying final/semis/quarters overrides (counted back from the final). */
export function bestOfForRound(t: RoundFormats, round: number, rounds: number): number {
  const fromEnd = rounds - round; // 0 = final
  if (fromEnd === 0 && t.final_best_of) return t.final_best_of;
  if (fromEnd === 1 && t.semis_best_of) return t.semis_best_of;
  if (fromEnd === 2 && t.quarters_best_of) return t.quarters_best_of;
  return t.best_of;
}

export function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round of ${2 ** (fromEnd + 1)}`;
}
