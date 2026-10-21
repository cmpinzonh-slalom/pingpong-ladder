import { setPoolForTesting } from '../db/database';
import { freshDb, signup } from './helpers';

let sql: (q: string) => unknown[];

beforeEach(() => {
  process.env.ALLOWED_EMAILS = '';
  process.env.ADMIN_EMAILS = 'owner@slalom.com';
  sql = freshDb().sql;
});

afterAll(() => {
  delete process.env.ADMIN_EMAILS;
  setPoolForTesting(null);
});

async function setup() {
  const owner = await signup('owner@slalom.com', 'Owner');
  const admin = await signup('admin@slalom.com', 'Ada Admin');
  await owner.agent.post(`/api/admin/users/${admin.id}/admin`).send({ admin: true }).expect(200);
  const a = await signup('a@slalom.com', 'Alice');
  const b = await signup('b@slalom.com', 'Bob');
  return { owner, admin, a, b };
}

const twoZero = [
  { a: 11, b: 5 },
  { a: 11, b: 7 },
];

describe('judge mode', () => {
  it('records a confirmed match for two other players with no approval', async () => {
    const { admin, a, b } = await setup();
    const res = await admin.agent
      .post('/api/matches/judge')
      .send({ player_a_id: a.id, player_b_id: b.id, games: twoZero })
      .expect(201);
    expect(res.body).toMatchObject({
      status: 'confirmed',
      winner_id: a.id,
      awaiting_user_id: null,
      rating_a_before: 1200,
      rating_a_after: 1216,
      rating_b_after: 1184,
      judged_by: { id: admin.id, name: 'Ada Admin' },
    });

    // Nothing pending for either player; ratings already applied
    expect((await b.agent.get('/api/matches/pending')).body.awaiting_me).toHaveLength(0);
    expect((await a.agent.get('/api/me')).body.rating).toBe(1216);

    // Shows (with the judge) in history, recent matches and head-to-head
    const hist = (await a.agent.get(`/api/users/${a.id}/history`)).body;
    expect(hist[0].judged_by.name).toBe('Ada Admin');
    const h2h = (await a.agent.get(`/api/h2h/${a.id}/${b.id}`)).body;
    expect(h2h).toMatchObject({ matches_played: 1, a_wins: 1 });
    expect(h2h.matches[0].judged_by.id).toBe(admin.id);
    expect((await a.agent.get('/api/matches/recent')).body[0].judged_by.id).toBe(admin.id);
  });

  it('is admin-only and an admin cannot judge their own match', async () => {
    const { owner, admin, a, b } = await setup();
    await a.agent.post('/api/matches/judge').send({ player_a_id: a.id, player_b_id: b.id, games: twoZero }).expect(403);
    await admin.agent.post('/api/matches/judge').send({ player_a_id: admin.id, player_b_id: b.id, games: twoZero }).expect(403);
    await owner.agent.post('/api/matches/judge').send({ player_a_id: a.id, player_b_id: owner.id, games: twoZero }).expect(403);
    // Owners can judge other players' matches too
    await owner.agent.post('/api/matches/judge').send({ player_a_id: a.id, player_b_id: b.id, games: twoZero }).expect(201);
  });

  it('validates players, scores and date', async () => {
    const { admin, a, b } = await setup();
    const judge = (body: object) => admin.agent.post('/api/matches/judge').send(body);
    await judge({ player_a_id: a.id, player_b_id: a.id, games: twoZero }).expect(400);
    await judge({ player_a_id: a.id, player_b_id: 9999, games: twoZero }).expect(404);
    await judge({ player_a_id: a.id, games: twoZero }).expect(400);
    await judge({ player_a_id: a.id, player_b_id: b.id, games: [{ a: 11, b: 10 }] }).expect(400);
    await judge({ player_a_id: a.id, player_b_id: b.id }).expect(400);
    const tomorrow = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    await judge({ player_a_id: a.id, player_b_id: b.id, games: twoZero, played_at: tomorrow }).expect(400);
    // Nothing was recorded
    expect((await a.agent.get('/api/me')).body.rating).toBe(1200);
  });

  it('rejects malformed scores without recording a match or changing ratings', async () => {
    const { admin, a, b } = await setup();
    for (const games of [
      [{ a: 11, b: null }],
      [{ a: 11, b: false }],
      [{ a: 11, b: '' }],
      [{ a: 11, b: [] }],
      [{ a: 11 }],
      [null],
      [{ a: '11', b: '3x' }],
    ]) {
      await admin.agent.post('/api/matches/judge').send({ player_a_id: a.id, player_b_id: b.id, games }).expect(400);
    }
    // Same protection for regular submissions
    await a.agent.post('/api/matches').send({ opponent_id: b.id, games: [{ me: 11, them: null }] }).expect(400);

    expect((await a.agent.get('/api/me')).body.rating).toBe(1200);
    expect((await b.agent.get('/api/me')).body.rating).toBe(1200);
    expect((await a.agent.get(`/api/users/${a.id}/history`)).body).toHaveLength(0);
    expect((await a.agent.get('/api/matches/pending')).body.awaiting_them).toHaveLength(0);
  });

  it('lets admins void a judged match, reversing ratings and keeping history consistent', async () => {
    const { owner, admin, a, b } = await setup();
    const judged = (
      await admin.agent.post('/api/matches/judge').send({ player_a_id: a.id, player_b_id: b.id, games: twoZero }).expect(201)
    ).body;
    // A regular match in between
    const reg = (await a.agent.post('/api/matches').send({ opponent_id: b.id, games: [{ me: 11, them: 3 }] }).expect(201)).body;
    await b.agent.post(`/api/matches/${reg.id}/confirm`).expect(200);
    const beforeVoid = (await a.agent.get('/api/me')).body.rating;

    await a.agent.post(`/api/matches/${judged.id}/void`).expect(403); // players can't void
    const v = await owner.agent.post(`/api/matches/${judged.id}/void`).expect(200); // any admin can
    expect(v.body.status).toBe('voided');
    await admin.agent.post(`/api/matches/${judged.id}/void`).expect(409); // only once

    expect((await a.agent.get('/api/me')).body.rating).toBe(beforeVoid - 16);
    expect((await a.agent.get(`/api/users/${a.id}/history`)).body).toHaveLength(1); // voided match hidden

    for (const p of [a, b]) {
      const h = (await p.agent.get(`/api/users/${p.id}/rating-history`)).body;
      const me = (await p.agent.get('/api/me')).body;
      expect(h.points.map((x: { kind: string }) => x.kind)).toEqual(['match', 'match', 'adjustment']);
      expect(h.points[2].label).toBe('Judged result voided by Owner');
      expect(h.points[h.points.length - 1].rating).toBe(me.rating);
      let prev = h.start;
      for (const pt of h.points) {
        expect(pt.rating_before).toBe(prev);
        prev = pt.rating;
      }
    }
  });

  it('only voids judged, non-tournament matches', async () => {
    const { admin, a, b } = await setup();
    const reg = (await a.agent.post('/api/matches').send({ opponent_id: b.id, games: [{ me: 11, them: 3 }] }).expect(201)).body;
    await admin.agent.post(`/api/matches/${reg.id}/void`).expect(409); // pending, not judged
    await b.agent.post(`/api/matches/${reg.id}/confirm`).expect(200);
    await admin.agent.post(`/api/matches/${reg.id}/void`).expect(409); // confirmed but not judged
    await admin.agent.post('/api/matches/99999/void').expect(404);

    // A judged row linked to a tournament is refused (tournament results use the bracket override)
    const judged = (
      await admin.agent.post('/api/matches/judge').send({ player_a_id: a.id, player_b_id: b.id, games: twoZero }).expect(201)
    ).body;
    sql(`UPDATE matches SET tournament_match_id = 1 WHERE id = ${judged.id}`);
    await admin.agent.post(`/api/matches/${judged.id}/void`).expect(409);
  });
});
