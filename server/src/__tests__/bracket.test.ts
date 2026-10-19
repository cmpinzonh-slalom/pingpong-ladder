import { bestOfForRound, drawBracket, DrawEntrant, roundName, seedCount, seedingOrder } from '../lib/bracket';

/** Deterministic PRNG for reproducible shuffles. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n entrants, user id i+1 has rating 2000 - i*10 (so id 1 is the best). */
function entrants(n: number): DrawEntrant[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: i + 1,
    rating: 2000 - i * 10,
    joinedAt: new Date(2026, 0, 1, 0, i),
  }));
}

/** Round in which slots a and b can first meet (1-based). */
function meetingRound(a: number, b: number): number {
  let r = 1;
  while (a >> r !== b >> r) r++;
  return r;
}

describe('seedingOrder', () => {
  it('matches the standard layout', () => {
    expect(seedingOrder(2)).toEqual([1, 2]);
    expect(seedingOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedingOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('pairs rank r with size+1-r in round 1', () => {
    const o = seedingOrder(32);
    for (let i = 0; i < 32; i += 2) expect(o[i] + o[i + 1]).toBe(33);
  });
});

describe('drawBracket', () => {
  for (let n = 2; n <= 64; n++) {
    it(`is valid for ${n} players`, () => {
      for (let trial = 0; trial < 5; trial++) {
        const slots = drawBracket(entrants(n), mulberry32(n * 100 + trial));
        const size = slots.length;
        const rounds = Math.log2(size);
        expect(Number.isInteger(rounds)).toBe(true);
        expect(size).toBeGreaterThanOrEqual(n);
        expect(size / 2).toBeLessThan(Math.max(n, 2));

        // Every player exactly once
        const ids = slots.filter(Boolean).map((s) => s!.userId);
        expect(ids.sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));

        // No bye vs bye
        for (let i = 0; i < size; i += 2) expect(slots[i] || slots[i + 1]).toBeTruthy();

        // Seeds are the top-rated players
        const seeds = seedCount(size, n);
        const slotOfSeed = (s: number) => slots.findIndex((x) => x?.seed === s);
        for (let s = 1; s <= seeds; s++) expect(slots[slotOfSeed(s)]!.userId).toBe(s);

        // Seeds 1 & 2 can only meet in the final; top 4 not before the semis; top 8 not before the quarters
        if (seeds >= 2) expect(meetingRound(slotOfSeed(1), slotOfSeed(2))).toBe(rounds);
        for (const tier of [4, 8, 16]) {
          if (seeds < tier) continue;
          for (let a = 1; a <= tier; a++)
            for (let b = a + 1; b <= tier; b++)
              expect(meetingRound(slotOfSeed(a), slotOfSeed(b))).toBeGreaterThanOrEqual(rounds - Math.log2(tier) + 1);
        }

        // Byes go to the strongest players: every bye opponent is ranked above every non-bye player
        const byeOpponents: number[] = [];
        for (let i = 0; i < size; i += 2) {
          if (!slots[i]) byeOpponents.push(slots[i + 1]!.userId);
          if (!slots[i + 1]) byeOpponents.push(slots[i]!.userId);
        }
        expect(byeOpponents.sort((a, b) => a - b)).toEqual(
          Array.from({ length: size - n }, (_, i) => i + 1)
        );
      }
    });
  }

  it('randomizes unseeded placement', () => {
    const a = drawBracket(entrants(16), mulberry32(1)).map((s) => s?.userId);
    const b = drawBracket(entrants(16), mulberry32(2)).map((s) => s?.userId);
    expect(a).not.toEqual(b);
  });

  it('breaks rating ties by signup time', () => {
    const e = entrants(4).map((x) => ({ ...x, rating: 1200 }));
    const slots = drawBracket(e, mulberry32(3));
    expect(slots.find((s) => s?.seed === 1)!.userId).toBe(1);
    expect(slots.find((s) => s?.seed === 2)!.userId).toBe(2);
  });

  it('rejects fewer than 2 players', () => {
    expect(() => drawBracket(entrants(1))).toThrow();
  });
});

describe('round helpers', () => {
  const t = { best_of: 3, quarters_best_of: null, semis_best_of: 5, final_best_of: 5 };
  it('applies per-round formats counted from the final', () => {
    expect(bestOfForRound(t, 1, 4)).toBe(3); // round of 16
    expect(bestOfForRound(t, 2, 4)).toBe(3); // quarters (no override)
    expect(bestOfForRound(t, 3, 4)).toBe(5); // semis
    expect(bestOfForRound(t, 4, 4)).toBe(5); // final
    expect(bestOfForRound({ ...t, final_best_of: 1 }, 1, 1)).toBe(1); // 2-player tournament: round 1 is the final
  });

  it('names rounds', () => {
    expect([1, 2, 3, 4, 5].map((r) => roundName(r, 5))).toEqual([
      'Round of 32',
      'Round of 16',
      'Quarterfinals',
      'Semifinals',
      'Final',
    ]);
  });
});
