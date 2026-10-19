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

const PW = 'correct horse battery';

/** Registers a user and returns a supertest agent holding the session cookie. */
async function login(email: string, name?: string) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: PW, display_name: name ?? `Player ${email.split('@')[0]}` })
    .expect(201);
  return { agent, id: res.body.id as number };
}

describe('auth', () => {
  it('rejects non-slalom emails and short passwords', async () => {
    await request(app).post('/api/auth/register').send({ email: 'x@gmail.com', password: PW, display_name: 'X' + 'x' }).expect(403);
    await request(app).post('/api/auth/register').send({ email: 'x@slalom.com', password: 'short', display_name: 'Xx' }).expect(400);
  });

  it('enforces the pilot allow-list', async () => {
    process.env.ALLOWED_EMAILS = 'miguel.pinzonhernand@slalom.com';
    await request(app).post('/api/auth/register').send({ email: 'other@slalom.com', password: PW, display_name: 'Other' }).expect(403);
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'Miguel.PinzonHernand@slalom.com', password: PW, display_name: 'Miguel' })
      .expect(201);
  });

  it('registers, logs out, and logs back in with the password', async () => {
    const { agent } = await login('a@slalom.com', 'Alice');
    const me = await agent.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ email: 'a@slalom.com', display_name: 'Alice', rating: 1200, is_admin: false });

    await request(app).post('/api/auth/register').send({ email: 'a@slalom.com', password: PW, display_name: 'Again' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: 'a@slalom.com', password: 'wrong password' }).expect(401);
    await request(app).post('/api/auth/login').send({ email: 'nobody@slalom.com', password: PW }).expect(401);

    const fresh = request.agent(app);
    await fresh.post('/api/auth/login').send({ email: ' A@Slalom.com ', password: PW }).expect(200);
    await fresh.get('/api/me').expect(200);
  });

  it('changes own password with the current password, revoking other sessions', async () => {
    const { agent } = await login('a@slalom.com');
    const other = request.agent(app);
    await other.post('/api/auth/login').send({ email: 'a@slalom.com', password: PW }).expect(200);

    await agent.post('/api/me/password').send({ current_password: 'nope', new_password: 'another password' }).expect(400);
    await agent.post('/api/me/password').send({ current_password: PW, new_password: 'another password' }).expect(200);

    await agent.get('/api/me').expect(200); // this session survives
    await other.get('/api/me').expect(401); // other device signed out
    await request(app).post('/api/auth/login').send({ email: 'a@slalom.com', password: 'another password' }).expect(200);
  });

  it('lets an admin reset a password, forcing a change on next login', async () => {
    process.env.ADMIN_EMAILS = 'admin@slalom.com';
    const admin = await login('admin@slalom.com', 'Admin');
    const victim = await login('b@slalom.com', 'Bob');

    // Non-admins can't use admin endpoints
    await victim.agent.get('/api/admin/users').expect(403);
    await victim.agent.post(`/api/admin/users/${admin.id}/reset-password`).expect(403);

    const list = await admin.agent.get('/api/admin/users').expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body[0]).not.toHaveProperty('password_hash');

    const reset = await admin.agent.post(`/api/admin/users/${victim.id}/reset-password`).expect(200);
    const temp = reset.body.temporary_password as string;
    expect(temp).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);

    await victim.agent.get('/api/me').expect(401); // old session revoked
    await request(app).post('/api/auth/login').send({ email: 'b@slalom.com', password: PW }).expect(401);

    const b = request.agent(app);
    const li = await b.post('/api/auth/login').send({ email: 'b@slalom.com', password: temp }).expect(200);
    expect(li.body.must_change_password).toBe(true);
    await b.get('/api/users').expect(403); // blocked until password changed
    await b.post('/api/me/password').send({ new_password: 'brand new password' }).expect(200);
    await b.get('/api/users').expect(200);
    delete process.env.ADMIN_EMAILS;
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

    const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
    const HOUR = 3600 * 1000;
    // Small client clock skew is tolerated
    await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win, played_at: ahead(2 * 60 * 1000) }).expect(201);
    // Regression: tomorrow's local noon submitted late tonight (~13h ahead) must be rejected
    await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win, played_at: ahead(13 * HOUR) }).expect(400);
    // Just past the skew allowance is rejected
    await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win, played_at: ahead(10 * 60 * 1000) }).expect(400);
    // Days ahead is rejected
    await a.agent.post('/api/matches').send({ opponent_id: b.id, games: win, played_at: ahead(48 * HOUR) }).expect(400);
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
