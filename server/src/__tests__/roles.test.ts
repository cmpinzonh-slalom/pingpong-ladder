import bcrypt from 'bcryptjs';
import { setPoolForTesting } from '../db/database';
import { freshDb, signup } from './helpers';

let sql: (q: string) => unknown[];

beforeEach(() => {
  process.env.ALLOWED_EMAILS = '';
  process.env.ADMIN_EMAILS = 'owner@slalom.com';
  sql = freshDb().sql;
});

afterEach(() => jest.restoreAllMocks());

afterAll(() => {
  delete process.env.ADMIN_EMAILS;
  setPoolForTesting(null);
});

describe('owner and admin roles', () => {
  it('reports roles on /me', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const me = await owner.agent.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ is_owner: true, is_admin: true });

    const p = await signup('p@slalom.com');
    const pm = await p.agent.get('/api/me').expect(200);
    expect(pm.body).toMatchObject({ is_owner: false, is_admin: false });
  });

  it('lets owners grant and revoke admin, effective immediately', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const u = await signup('u@slalom.com', 'User');

    await u.agent.get('/api/admin/users').expect(403);
    const granted = await owner.agent.post(`/api/admin/users/${u.id}/admin`).send({ admin: true }).expect(200);
    expect(granted.body).toMatchObject({ is_admin: true, is_owner: false });

    // Same session, no re-login needed
    await u.agent.get('/api/admin/users').expect(200);
    const list = await owner.agent.get('/api/admin/users').expect(200);
    expect(list.body.find((x: { id: number }) => x.id === u.id)).toMatchObject({ is_admin: true });

    await owner.agent.post(`/api/admin/users/${u.id}/admin`).send({ admin: false }).expect(200);
    await u.agent.get('/api/admin/users').expect(403);
  });

  it('does not let admins grant admin, and owners cannot be changed', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const admin = await signup('admin@slalom.com', 'Admin');
    const p = await signup('p@slalom.com');
    await owner.agent.post(`/api/admin/users/${admin.id}/admin`).send({ admin: true }).expect(200);

    await admin.agent.post(`/api/admin/users/${p.id}/admin`).send({ admin: true }).expect(403);
    await owner.agent.post(`/api/admin/users/${owner.id}/admin`).send({ admin: false }).expect(403);
    await owner.agent.post(`/api/admin/users/${p.id}/admin`).send({ admin: 'yes' }).expect(400);
  });

  it('limits password resets by role', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const admin = await signup('admin@slalom.com', 'Admin');
    const admin2 = await signup('admin2@slalom.com', 'Admin Two');
    const p = await signup('p@slalom.com');
    await owner.agent.post(`/api/admin/users/${admin.id}/admin`).send({ admin: true }).expect(200);
    await owner.agent.post(`/api/admin/users/${admin2.id}/admin`).send({ admin: true }).expect(200);

    await admin.agent.post(`/api/admin/users/${owner.id}/reset-password`).expect(403);
    await admin.agent.post(`/api/admin/users/${admin2.id}/reset-password`).expect(403);
    await admin.agent.post(`/api/admin/users/${p.id}/reset-password`).expect(200);
    await owner.agent.post(`/api/admin/users/${admin2.id}/reset-password`).expect(200);
  });

  it('re-checks reset eligibility atomically if the target is promoted mid-request', async () => {
    const owner = await signup('owner@slalom.com', 'Owner');
    const admin = await signup('admin@slalom.com', 'Admin');
    const target = await signup('t@slalom.com', 'Target');
    await owner.agent.post(`/api/admin/users/${admin.id}/admin`).send({ admin: true }).expect(200);

    // Simulate an owner promoting the target while the reset is hashing the temporary password.
    const realHash = bcrypt.hash.bind(bcrypt) as (s: string, r: number) => Promise<string>;
    jest.spyOn(bcrypt, 'hash').mockImplementation((async (pw: string, rounds: number) => {
      sql(`UPDATE users SET is_admin = TRUE WHERE id = ${target.id}`);
      return realHash(pw, rounds);
    }) as never);

    await admin.agent.post(`/api/admin/users/${target.id}/reset-password`).expect(403);
    // Target's password and session are untouched
    await target.agent.get('/api/me').expect(200);
  });
});
