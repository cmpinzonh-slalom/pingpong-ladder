import request from 'supertest';
import app from '../app';
import { setPoolForTesting } from '../db/database';
import { freshDb, signup } from './helpers';

type Agent = ReturnType<typeof request.agent>;
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

const future = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();
const past = () => new Date(Date.now() - 60 * 1000).toISOString();

async function createTournament(admin: Agent, extra: Record<string, unknown> = {}) {
  const res = await admin
    .post('/api/tournaments')
    .send({ name: 'Autumn Cup', starts_on: '2026-11-01', signup_deadline: future(), best_of: 3, ...extra })
    .expect(201);
  return res.body.id as number;
}

/** Signs up `n` players with descending ratings (p1 highest). */
async function players(n: number) {
  const list = [];
  for (let i = 1; i <= n; i++) {
    const p = await signup(`p${i}@slalom.com`, `Player ${i}`);
    sql(`UPDATE users SET rating = ${1500 - i * 10} WHERE id = ${p.id}`);
    list.push(p);
  }
  return list;
}

async function closeAndDraw(admin: Agent, id: number) {
  await admin.patch(`/api/tournaments/${id}`).send({ signup_deadline: past() }).expect(200);
  return (await admin.post(`/api/tournaments/${id}/generate`).expect(200)).body;
}

const win2 = [
  { me: 11, them: 5 },
  { me: 11, them: 7 },
];

describe('tournament setup', () => {
  it('only admins create tournaments, with validation', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const p = await signup('p@slalom.com');
    await p.agent.post('/api/tournaments').send({ name: 'Nope', starts_on: '2026-11-01', signup_deadline: future() }).expect(403);
    await owner.agent.post('/api/tournaments').send({ name: 'X', starts_on: '2026-11-01', signup_deadline: future() }).expect(400);
    await owner.agent
      .post('/api/tournaments')
      .send({ name: 'Bad format', starts_on: '2026-11-01', signup_deadline: future(), best_of: 2 })
      .expect(400);

    const id = await createTournament(owner.agent, { final_best_of: 5 });
    const list = await p.agent.get('/api/tournaments').expect(200);
    expect(list.body[0]).toMatchObject({ id, name: 'Autumn Cup', starts_on: '2026-11-01', best_of: 3, final_best_of: 5, signup_open: true });
  });

  it('handles sign-up, withdrawal, caps and the deadline', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const [a, b, c] = await players(3);
    const id = await createTournament(owner.agent, { max_players: 2 });

    await a.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    await a.agent.post(`/api/tournaments/${id}/signup`).expect(409);
    await b.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    await c.agent.post(`/api/tournaments/${id}/signup`).expect(409); // full

    await b.agent.post(`/api/tournaments/${id}/withdraw`).expect(200);
    const d = await c.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    expect(d.body.entrants.map((e: { id: number }) => e.id)).toEqual([a.id, c.id]);

    // Admin removes a player
    await owner.agent.delete(`/api/tournaments/${id}/entries/${c.id}`).expect(200);

    await owner.agent.patch(`/api/tournaments/${id}`).send({ signup_deadline: past() }).expect(200);
    await b.agent.post(`/api/tournaments/${id}/signup`).expect(409);
    await a.agent.post(`/api/tournaments/${id}/withdraw`).expect(409);
  });

  it('generates the bracket only after the deadline, for admins, with byes to the top seeds', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const ps = await players(5);
    const id = await createTournament(owner.agent);
    for (const p of ps) await p.agent.post(`/api/tournaments/${id}/signup`).expect(200);

    await owner.agent.post(`/api/tournaments/${id}/generate`).expect(409); // before deadline
    await owner.agent.patch(`/api/tournaments/${id}`).send({ signup_deadline: past() }).expect(200);
    await ps[0].agent.post(`/api/tournaments/${id}/generate`).expect(403);
    const t = (await owner.agent.post(`/api/tournaments/${id}/generate`).expect(200)).body;
    await owner.agent.post(`/api/tournaments/${id}/generate`).expect(409); // only once

    expect(t.status).toBe('in_progress');
    expect(t.rounds.map((r: { name: string }) => r.name)).toEqual(['Quarterfinals', 'Semifinals', 'Final']);
    const seeds = Object.fromEntries(t.entrants.map((e: { id: number; seed: number | null }) => [e.id, e.seed]));
    expect(seeds[ps[0].id]).toBe(1);
    expect(seeds[ps[1].id]).toBe(2);

    // 8-slot bracket with 5 players: 3 byes, going to the 3 highest-rated players
    const byes = t.rounds[0].matches.filter((m: { status: string }) => m.status === 'bye');
    expect(byes.map((m: { winner_id: number }) => m.winner_id).sort()).toEqual([ps[0].id, ps[1].id, ps[2].id].sort());
    const ready = t.rounds[0].matches.filter((m: { status: string }) => m.status === 'ready');
    expect(ready).toHaveLength(1);
    // Bye winners already advanced into the semifinals
    const semiPlayers = t.rounds[1].matches.flatMap((m: { player1: { id: number } | null; player2: { id: number } | null }) =>
      [m.player1?.id, m.player2?.id].filter(Boolean)
    );
    expect(semiPlayers).toHaveLength(3);
  });

  it('needs at least 2 players to draw', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const [a] = await players(1);
    const id = await createTournament(owner.agent);
    await a.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    await owner.agent.patch(`/api/tournaments/${id}`).send({ signup_deadline: past() }).expect(200);
    await owner.agent.post(`/api/tournaments/${id}/generate`).expect(409);
  });
});

describe('tournament play', () => {
  async function twoPlayerFinal(extra: Record<string, unknown> = {}) {
    const owner = await signup('owner@slalom.com', 'Owner');
    const [a, b, c] = await players(3);
    const id = await createTournament(owner.agent, extra);
    await a.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    await b.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    const t = await closeAndDraw(owner.agent, id);
    const tmId = t.rounds[0].matches[0].id as number;
    return { owner, a, b, c, id, tmId };
  }

  it('advances only after both players agree, enforcing the format, and updates ratings', async () => {
    const { a, b, c, id, tmId } = await twoPlayerFinal({ final_best_of: 3 });

    await c.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: win2 }).expect(403);
    await a.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: [{ me: 11, them: 3 }] }).expect(400);

    const m = (await a.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: win2 }).expect(201)).body;
    expect(m.tournament).toMatchObject({ id, name: 'Autumn Cup', round_name: 'Final' });
    await b.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: win2 }).expect(409); // already pending

    // Shows on B's dashboard
    const pend = await b.agent.get('/api/matches/pending').expect(200);
    expect(pend.body.awaiting_me[0].tournament.name).toBe('Autumn Cup');

    let t = (await a.agent.get(`/api/tournaments/${id}`).expect(200)).body;
    expect(t.rounds[0].matches[0].pending.id).toBe(m.id);
    expect(t.status).toBe('in_progress');

    // Counter must also respect the format
    await b.agent.post(`/api/matches/${m.id}/counter`).send({ games: [{ me: 11, them: 2 }] }).expect(400);
    await b.agent.post(`/api/matches/${m.id}/confirm`).expect(200);

    t = (await a.agent.get(`/api/tournaments/${id}`).expect(200)).body;
    expect(t.status).toBe('completed');
    expect(t.winner.id).toBe(a.id);
    expect(t.rounds[0].matches[0]).toMatchObject({ status: 'completed', winner_id: a.id });
    expect(t.rounds[0].matches[0].result.id).toBe(m.id);

    const me = (await a.agent.get('/api/me').expect(200)).body;
    expect(me.rating).toBeGreaterThan(1490);
  });

  it('runs a 4-player bracket with admin walkovers and overrides', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const ps = await players(4);
    const id = await createTournament(owner.agent, { best_of: 1 });
    for (const p of ps) await p.agent.post(`/api/tournaments/${id}/signup`).expect(200);
    let t = await closeAndDraw(owner.agent, id);

    const [semi1, semi2] = t.rounds[0].matches;
    const finalId = t.rounds[1].matches[0].id;
    expect(semi1.status).toBe('ready');

    // Semi 1: admin enters the result directly (player1 wins 11-9)
    t = (
      await owner.agent
        .post(`/api/tournaments/${id}/matches/${semi1.id}/admin-result`)
        .send({ games: [{ p1: 11, p2: 9 }] })
        .expect(200)
    ).body;
    expect(t.rounds[0].matches[0]).toMatchObject({ status: 'completed', winner_id: semi1.player1.id });
    const ratingsAfterSemi1 = (await owner.agent.get('/api/users').expect(200)).body;
    const p1Rating = ratingsAfterSemi1.find((u: { id: number }) => u.id === semi1.player1.id).rating;

    // Override semi 1 before the final starts: now player2 wins by walkover; rating change reversed
    t = (
      await owner.agent
        .post(`/api/tournaments/${id}/matches/${semi1.id}/admin-result`)
        .send({ walkover: semi1.player2.id })
        .expect(200)
    ).body;
    expect(t.rounds[0].matches[0]).toMatchObject({ status: 'walkover', winner_id: semi1.player2.id });
    const users = (await owner.agent.get('/api/users').expect(200)).body;
    const original = (pid: number) => 1500 - (ps.findIndex((p) => p.id === pid) + 1) * 10;
    expect(p1Rating).not.toBe(original(semi1.player1.id)); // the admin result did change ratings
    expect(users.find((u: { id: number }) => u.id === semi1.player1.id).rating).toBe(original(semi1.player1.id));
    expect(users.find((u: { id: number }) => u.id === semi1.player2.id).rating).toBe(original(semi1.player2.id));
    expect(t.rounds[1].matches[0].player1.id).toBe(semi1.player2.id);

    // Semi 2 via players
    const s2Winner = ps.find((p) => p.id === semi2.player1.id)!;
    const s2Loser = ps.find((p) => p.id === semi2.player2.id)!;
    const m = (await s2Winner.agent.post(`/api/tournaments/${id}/matches/${semi2.id}/result`).send({ games: [{ me: 11, them: 8 }] }).expect(201)).body;
    await s2Loser.agent.post(`/api/matches/${m.id}/confirm`).expect(200);

    t = (await owner.agent.get(`/api/tournaments/${id}`).expect(200)).body;
    expect(t.rounds[1].matches[0]).toMatchObject({ status: 'ready' });

    // Final started (pending submission) -> semis can no longer be overridden
    const finalist = ps.find((p) => p.id === semi1.player2.id)!;
    await finalist.agent.post(`/api/tournaments/${id}/matches/${finalId}/result`).send({ games: [{ me: 11, them: 6 }] }).expect(201);
    await owner.agent.post(`/api/tournaments/${id}/matches/${semi2.id}/admin-result`).send({ walkover: semi2.player2.id }).expect(409);

    // Admin resolves the final with a walkover; pending submission is set aside
    t = (await owner.agent.post(`/api/tournaments/${id}/matches/${finalId}/admin-result`).send({ walkover: s2Winner.id }).expect(200)).body;
    expect(t.status).toBe('completed');
    expect(t.winner.id).toBe(s2Winner.id);
    const pend = (await s2Winner.agent.get('/api/matches/pending').expect(200)).body;
    expect(pend.awaiting_me).toHaveLength(0);

    // Non-admins can't use admin results
    await finalist.agent.post(`/api/tournaments/${id}/matches/${finalId}/admin-result`).send({ walkover: finalist.id }).expect(403);
  });

  it('reverses ratings when a confirmed result is overridden', async () => {
    const { owner, a, b, id, tmId } = await twoPlayerFinal({ best_of: 1 });
    const m = (await a.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: [{ me: 11, them: 4 }] }).expect(201)).body;
    await b.agent.post(`/api/matches/${m.id}/confirm`).expect(200);
    const before = (await a.agent.get('/api/me')).body.rating;
    expect(before).not.toBe(1490);

    // Final has no next match, so it can be overridden even after completion
    const t = (await owner.agent.post(`/api/tournaments/${id}/matches/${tmId}/admin-result`).send({ walkover: b.id }).expect(200)).body;
    expect(t.winner.id).toBe(b.id);
    expect((await a.agent.get('/api/me')).body.rating).toBe(1490);
    expect((await b.agent.get('/api/me')).body.rating).toBe(1480);
    // Voided match no longer counts in history
    const hist = (await a.agent.get(`/api/users/${a.id}/history`)).body;
    expect(hist).toHaveLength(0);
  });

  it('cancelling withdraws pending submissions and freezes the bracket', async () => {
    const { owner, a, b, id, tmId } = await twoPlayerFinal();
    const m = (await a.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: win2 }).expect(201)).body;
    await owner.agent.post(`/api/tournaments/${id}/cancel`).expect(200);
    expect((await b.agent.get('/api/matches/pending')).body.awaiting_me).toHaveLength(0);
    await b.agent.post(`/api/matches/${m.id}/confirm`).expect(409);
    await a.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: win2 }).expect(409);
    await owner.agent.post(`/api/tournaments/${id}/matches/${tmId}/admin-result`).send({ walkover: a.id }).expect(409);
    expect((await a.agent.get(`/api/tournaments/${id}`)).body.status).toBe('cancelled');
  });

  it('rejects confirming or correcting a pending tournament result once the tournament is cancelled', async () => {
    const { a, b, id, tmId } = await twoPlayerFinal();
    const m = (await a.agent.post(`/api/tournaments/${id}/matches/${tmId}/result`).send({ games: win2 }).expect(201)).body;
    // Flip the status directly (as if a cancel committed concurrently) to exercise the check under lock
    sql(`UPDATE tournaments SET status = 'cancelled' WHERE id = ${id}`);
    await b.agent.post(`/api/matches/${m.id}/confirm`).expect(409);
    await b.agent.post(`/api/matches/${m.id}/counter`).send({ games: win2 }).expect(409);
  });

  it('cannot edit a tournament after the draw', async () => {
    const { owner, id } = await twoPlayerFinal();
    await owner.agent.patch(`/api/tournaments/${id}`).send({ best_of: 5 }).expect(409);
  });
});
