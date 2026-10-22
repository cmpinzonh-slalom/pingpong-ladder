import request from 'supertest';
import app from '../app';
import { setPoolForTesting } from '../db/database';
import { freshDb, signup } from './helpers';

beforeEach(() => {
  process.env.ALLOWED_EMAILS = '';
  freshDb();
});

afterAll(() => setPoolForTesting(null));

describe('editing the display name', () => {
  it('updates the name everywhere it is shown', async () => {
    const a = await signup('a@slalom.com', 'Alice');
    const b = await signup('b@slalom.com', 'Bob');
    const m = (await a.agent.post('/api/matches').send({ opponent_id: b.id, games: [{ me: 11, them: 4 }] }).expect(201)).body;
    await b.agent.post(`/api/matches/${m.id}/confirm`).expect(200);

    const res = await a.agent.patch('/api/me').send({ display_name: '  Alice   Wonder  ' }).expect(200);
    expect(res.body.display_name).toBe('Alice Wonder'); // trimmed, whitespace collapsed
    expect((await a.agent.get('/api/me')).body.display_name).toBe('Alice Wonder');

    // Leaderboard, profile and past matches use the new name (names are never copied into matches)
    const board = (await b.agent.get('/api/users')).body;
    expect(board.find((u: { id: number }) => u.id === a.id).name).toBe('Alice Wonder');
    expect((await b.agent.get(`/api/users/${a.id}`)).body.name).toBe('Alice Wonder');
    const hist = (await b.agent.get(`/api/users/${b.id}/history`)).body;
    expect(hist[0].player_a.name).toBe('Alice Wonder');
    // Players can only change their own name
    expect((await b.agent.get('/api/me')).body.display_name).toBe('Bob');
  });

  it('rejects invalid names', async () => {
    const a = await signup('a@slalom.com', 'Alice');
    const patch = (display_name: unknown) => a.agent.patch('/api/me').send({ display_name });
    for (const bad of ['', ' ', 'x', 'x'.repeat(41), null, 42, ['Alice'], { n: 'Alice' }, 'Al\u200bice', 'Al\u202eice', 'Al\u0007ice']) {
      await patch(bad).expect(400);
    }
    await a.agent.patch('/api/me').send({}).expect(400);
    expect((await a.agent.get('/api/me')).body.display_name).toBe('Alice'); // unchanged
    // Line breaks and runs of spaces are collapsed into a single space rather than stored
    expect((await patch('Al\n\n  ice').expect(200)).body.display_name).toBe('Al ice');
    await patch('x'.repeat(40)).expect(200);
    await patch('Zoë Müller-O’Brien').expect(200); // accents and punctuation are fine
  });

  // Blank-looking or text-reordering names: bidi isolates, Arabic letter mark, fillers, marks-only, etc.
  const BLANK_LOOKING: [string, string][] = [
    ['bidi isolates (reviewer example)', '\u2066\u2069'],
    ['isolates around spaces', '\u2066 \u2069'],
    ['Arabic letter mark', '\u061c\u061c'],
    ['LRI/RLI/FSI/PDI', '\u2066\u2067\u2068\u2069'],
    ['zero-width + isolate', '\u200b\u2066'],
    ['bidi override around a name', '\u202eAlice\u202c'],
    ['soft hyphens', '\u00ad\u00ad'],
    ['Hangul fillers', '\u3164\u3164'],
    ['half-width Hangul filler', '\uffa0\uffa0'],
    ['blank Braille cells', '\u2800\u2800'],
    ['combining marks only', '\u0301\u0301'],
    ['grapheme joiners', '\u034f\u034f'],
    ['spaces only (nbsp / ideographic)', '\u00a0\u3000'],
  ];

  it.each(BLANK_LOOKING)('rejects a blank-looking name when renaming: %s', async (_label, bad) => {
    const a = await signup('a@slalom.com', 'Alice');
    await a.agent.patch('/api/me').send({ display_name: bad }).expect(400);
    expect((await a.agent.get('/api/me')).body.display_name).toBe('Alice');
  });

  it.each(BLANK_LOOKING)('rejects a blank-looking name when registering: %s', async (_label, bad) => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@slalom.com', password: 'correct horse battery', display_name: bad })
      .expect(400);
    // No account was created
    await request(app).post('/api/auth/login').send({ email: 'new@slalom.com', password: 'correct horse battery' }).expect(401);
  });

  it('still accepts real names in other scripts, accents and emoji', async () => {
    const a = await signup('a@slalom.com', 'Alice');
    for (const good of ['李小龍', 'محمد علي', 'Σωκράτης', 'Zoe\u0301 Mu\u0308ller', 'José O’Brien-Smith', '🏓 Ana', 'Ana 2', '김철수']) {
      const r = await a.agent.patch('/api/me').send({ display_name: good }).expect(200);
      expect(r.body.display_name).toBe(good);
    }
  });

  it('requires sign-in', async () => {
    const { default: request } = await import('supertest');
    const { default: app } = await import('../app');
    await request(app).patch('/api/me').send({ display_name: 'Nope' }).expect(401);
  });
});
