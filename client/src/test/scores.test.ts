import { summarize, validateGame } from '../lib/scores';

describe('client score validation', () => {
  it('validates games', () => {
    expect(validateGame({ me: 11, them: 9 })).toBeNull();
    expect(validateGame({ me: 12, them: 10 })).toBeNull();
    expect(validateGame({ me: 11, them: 10 })).not.toBeNull();
    expect(validateGame({ me: NaN, them: 3 })).not.toBeNull();
  });

  it('summarizes matches', () => {
    expect(summarize([{ me: 11, them: 5 }, { me: 11, them: 7 }])).toEqual({ ok: true, myGames: 2, theirGames: 0, iWon: true });
    expect(summarize([{ me: 5, them: 11 }, { me: 11, them: 7 }, { me: 8, them: 11 }])).toMatchObject({ ok: true, iWon: false });
    expect(summarize([{ me: 11, them: 5 }]).ok).toBe(false);
    expect(summarize([{ me: 11, them: 5 }, { me: 11, them: 5 }, { me: 5, them: 11 }]).ok).toBe(false);
  });
});
