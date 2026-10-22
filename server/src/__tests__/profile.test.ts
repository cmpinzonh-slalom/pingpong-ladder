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

  it('requires sign-in', async () => {
    const { default: request } = await import('supertest');
    const { default: app } = await import('../app');
    await request(app).patch('/api/me').send({ display_name: 'Nope' }).expect(401);
  });
});
