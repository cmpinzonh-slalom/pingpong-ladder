import { applyElo, expectedScore } from '../lib/elo';
import { parseGamePairs, parseScore, validateGame, validateMatch } from '../lib/scores';

describe('elo', () => {
  it('gives 50% expectation for equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('moves 16 points between equal players with K=32', () => {
    expect(applyElo(1200, 1200, true)).toEqual({ newA: 1216, newB: 1184, delta: 16 });
    expect(applyElo(1200, 1200, false)).toEqual({ newA: 1184, newB: 1216, delta: -16 });
  });

  it('rewards upsets more than expected wins', () => {
    const upset = applyElo(1000, 1400, true).delta;
    const expected = applyElo(1400, 1000, true).delta;
    expect(upset).toBeGreaterThan(expected);
    expect(upset).toBe(29);
    expect(expected).toBe(3);
  });

  it('is zero-sum', () => {
    const r = applyElo(1337, 1188, false);
    expect(r.newA + r.newB).toBe(1337 + 1188);
  });
});

describe('score validation', () => {
  it.each([
    [{ a: 11, b: 0 }, null],
    [{ a: 11, b: 9 }, null],
    [{ a: 12, b: 10 }, null],
    [{ a: 9, b: 11 }, null],
    [{ a: 20, b: 18 }, null],
  ])('accepts %j', (g, expected) => {
    expect(validateGame(g)).toBe(expected);
  });

  it.each([
    { a: 10, b: 8 },
    { a: 11, b: 10 },
    { a: 13, b: 10 },
    { a: -1, b: 11 },
    { a: 11.5, b: 3 },
  ])('rejects %j', (g) => {
    expect(validateGame(g)).not.toBeNull();
  });

  it('accepts a single game, best of 3 and best of 5', () => {
    expect(validateMatch([{ a: 11, b: 9 }])).toMatchObject({ ok: true, aWon: true, aGames: 1, bGames: 0 });
    expect(validateMatch([{ a: 10, b: 12 }])).toMatchObject({ ok: true, aWon: false });
    expect(validateMatch([{ a: 11, b: 5 }, { a: 11, b: 7 }])).toMatchObject({ ok: true, aWon: true });
    expect(validateMatch([{ a: 11, b: 5 }, { a: 7, b: 11 }, { a: 9, b: 11 }])).toMatchObject({ ok: true, aWon: false });
    expect(
      validateMatch([{ a: 11, b: 5 }, { a: 7, b: 11 }, { a: 9, b: 11 }, { a: 11, b: 3 }, { a: 12, b: 10 }])
    ).toMatchObject({ ok: true, aWon: true, aGames: 3, bGames: 2 });
  });

  it('rejects undecided or over-long matches', () => {
    expect(validateMatch([]).ok).toBe(false);
    expect(validateMatch([{ a: 11, b: 5 }, { a: 5, b: 11 }]).ok).toBe(false);
    // Decided 2-0 but a third game recorded
    expect(validateMatch([{ a: 11, b: 5 }, { a: 11, b: 5 }, { a: 5, b: 11 }]).ok).toBe(false);
  });
});

describe('parseScore', () => {
  it('accepts only non-negative integers', () => {
    expect(parseScore(11)).toBe(11);
    expect(parseScore(0)).toBe(0);
    expect(parseScore('11')).toBe(11);
    for (const bad of [null, undefined, false, true, '', ' ', [], {}, '11a', '1e1', -1, 11.5, NaN, Infinity, '-3']) {
      expect(parseScore(bad)).toBeNaN();
    }
  });

  it('makes malformed games fail validation instead of becoming zeros', () => {
    const games = parseGamePairs([{ a: 11, b: null }], 'a', 'b').map((g) => ({ a: g.s1, b: g.s2 }));
    expect(validateMatch(games).ok).toBe(false);
    expect(parseGamePairs([null, 5], 'a', 'b').every((g) => Number.isNaN(g.s1) && Number.isNaN(g.s2))).toBe(true);
  });
});
