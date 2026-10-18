import fs from 'fs';
import path from 'path';
import { newDb } from 'pg-mem';
import request from 'supertest';
import app from '../app';
import { setPoolForTesting } from '../db/database';
import { captureMailForTesting, MailMessage } from '../lib/mailer';

let outbox: MailMessage[] = [];

function freshDb() {
  const db = newDb();
  db.public.none(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
  const { Pool } = db.adapters.createPg();
  setPoolForTesting(new Pool());
}

beforeEach(() => {
  process.env.ALLOWED_EMAILS = '';
  freshDb();
  outbox = [];
  captureMailForTesting(outbox);
});

afterAll(() => {
  captureMailForTesting(null);
  setPoolForTesting(null);
});

/** Signs in via magic link and returns a supertest agent holding the session cookie. */
async function login(email: string, name?: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/request-link').send({ email }).expect(200);
  const msg = outbox.pop()!;
  const token = decodeURIComponent(/token=([^\s"]+)/.exec(msg.text)![1]);
  await agent.post('/api/auth/verify').send({ token }).expect(200);
  if (name) await agent.patch('/api/me').send({ display_name: name }).expect(200);
  const me = await agent.get('/api/me').expect(200);
  return { agent, id: me.body.id as number };
}

describe('auth', () => {
  it('rejects non-slalom emails', async () => {
    const res = await request(app).post('/api/auth/request-link').send({ email: 'x@gmail.com' });
    expect(res.status).toBe(403);
    expect(outbox).toHaveLength(0);
  });

  it('enforces the pilot allow-list', async () => {
    process.env.ALLOWED_EMAILS = 'miguel.pinzonhernand@slalom.com';
    await request(app).post('/api/auth/request-link').send({ email: 'other@slalom.com' }).expect(403);
    await request(app).post('/api/auth/request-link').send({ email: 'Miguel.PinzonHernand@slalom.com' }).expect(200);
  });

  it('logs in with a magic link, which is single use', async () => {
    await request(app).post('/api/auth/request-link').send({ email: 'a@slalom.com' }).expect(200);
    const token = decodeURIComponent(/token=([^\s"]+)/.exec(outbox[0].text)![1]);
    const agent = request.agent(app);
    await agent.post('/api/auth/verify').send({ token }).expect(200);
    const me = await agent.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ email: 'a@slalom.com', rating: 1200, display_name: null });
    await request(app).post('/api/auth/verify').send({ token }).expect(400);
  });

  it('requires a session', async () => {
    await request(app).get('/api/me').expect(401);
    await request(app).get('/api/users').expect(401);
  });
});

describe('matches', () => {
  const win = [
    { me: 11, them: 7 },
    { me: 11, them: 9 },
  ];

  it('only changes ratings after the opponent confirms', async () => {
    const a = await login('a@slalom.com', 'Alice');
    const b = await login('b@slalom.com', 'Bob');

    const created = await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win }).expect(201);
    expect(created.body.status).toBe('pending');
    expect(created.body.winner_id).toBe(a.id);
    expect(outbox.some((m) => m.to === 'b@slalom.com')).toBe(true);

    let board = await a.agent.get('/api/users').expect(200);
    expect(board.body.every((u: { rating: number }) => u.rating === 1200)).toBe(true);

    // Submitter cannot confirm their own result
    await a.agent.post(`/api/matches/${created.body.id}/confirm`).expect(403);

    const pending = await b.agent.get('/api/matches/pending').expect(200);
    expect(pending.body.awaiting_me).toHaveLength(1);

    const confirmed = await b.agent.post(`/api/matches/${created.body.id}/confirm`).expect(200);
    expect(confirmed.body).toMatchObject({ status: 'confirmed', rating_a_before: 1200, rating_a_after: 1216, rating_b_after: 1184 });

    board = await a.agent.get('/api/users').expect(200);
    expect(board.body[0]).toMatchObject({ name: 'Alice', rating: 1216, wins: 1, losses: 0 });
    expect(board.body[1]).toMatchObject({ name: 'Bob', rating: 1184, wins: 0, losses: 1 });

    // Cannot confirm twice
    await b.agent.post(`/api/matches/${created.body.id}/confirm`).expect(409);
  });

  it('supports counter-proposals back and forth', async () => {
    const a = await login('a@slalom.com', 'Alice');
    const b = await login('b@slalom.com', 'Bob');
    const m1 = await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win }).expect(201);

    // Bob says he actually won 2-1 (from Bob's perspective)
    const m2 = await b.agent
      .post(`/api/matches/${m1.body.id}/counter`)
      .send({ games: [{ me: 7, them: 11 }, { me: 11, them: 9 }, { me: 11, them: 4 }] })
      .expect(201);
    expect(m2.body).toMatchObject({ status: 'pending', winner_id: b.id, awaiting_user_id: a.id, parent_match_id: m1.body.id });
    // Stored from player A (Alice) perspective
    expect(m2.body.games[0]).toEqual({ a: 11, b: 7 });

    // Old one can no longer be confirmed
    await b.agent.post(`/api/matches/${m1.body.id}/confirm`).expect(409);
    // Bob can't confirm his own counter
    await b.agent.post(`/api/matches/${m2.body.id}/confirm`).expect(403);

    await a.agent.post(`/api/matches/${m2.body.id}/confirm`).expect(200);
    const me = await b.agent.get('/api/me').expect(200);
    expect(me.body.rating).toBe(1216);
  });

  it('validates scores and opponents', async () => {
    const a = await login('a@slalom.com');
    const b = await login('b@slalom.com');
    await a.agent.post('/api/matches').send({ opponent_id: a.id, games: win }).expect(400);
    await a.agent.post('/api/matches').send({ opponent_id: 9999, games: win }).expect(404);
    await a.agent.post('/api/matches').send({ opponent_id: b.id, games: [{ me: 11, them: 10 }] }).expect(400);
  });

  it('lets either player withdraw a pending match', async () => {
    const a = await login('a@slalom.com');
    const b = await login('b@slalom.com');
    const c = await login('c@slalom.com');
    const m = await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win }).expect(201);
    await c.agent.post(`/api/matches/${m.body.id}/withdraw`).expect(403);
    await b.agent.post(`/api/matches/${m.body.id}/withdraw`).expect(200);
    await b.agent.post(`/api/matches/${m.body.id}/confirm`).expect(409);
  });

  it('reports profile, history and head-to-head', async () => {
    const a = await login('a@slalom.com', 'Alice');
    const b = await login('b@slalom.com', 'Bob');
    for (let i = 0; i < 2; i++) {
      const m = await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win }).expect(201);
      await b.agent.post(`/api/matches/${m.body.id}/confirm`).expect(200);
    }
    const m = await b.agent.post('/api/matches').send({ opponent_id: a.id, games: win }).expect(201);
    await a.agent.post(`/api/matches/${m.body.id}/confirm`).expect(200);

    const profile = await a.agent.get(`/api/users/${a.id}`).expect(200);
    expect(profile.body).toMatchObject({ wins: 2, losses: 1, played: 3, rank: 1 });

    const hist = await a.agent.get(`/api/users/${a.id}/history`).expect(200);
    expect(hist.body).toHaveLength(3);

    const h2h = await a.agent.get(`/api/h2h/${a.id}/${b.id}`).expect(200);
    expect(h2h.body).toMatchObject({ matches_played: 3, a_wins: 2, b_wins: 1, a_games: 4, b_games: 2 });
  });
});
