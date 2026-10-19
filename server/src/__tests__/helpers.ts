import fs from 'fs';
import path from 'path';
import { newDb } from 'pg-mem';
import request from 'supertest';
import app from '../app';
import { setPoolForTesting } from '../db/database';

export const PW = 'correct horse battery';

/** Fresh in-memory Postgres with the real schema. Returns a helper for raw SQL. */
export function freshDb() {
  const db = newDb();
  db.public.none(fs.readFileSync(path.join(__dirname, '../db/init.sql'), 'utf8'));
  const { Pool } = db.adapters.createPg();
  setPoolForTesting(new Pool());
  return { sql: (q: string) => db.public.many(q) };
}

/** Registers a user and returns a supertest agent holding the session cookie. */
export async function signup(email: string, name?: string) {
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, password: PW, display_name: name ?? `Player ${email.split('@')[0]}` })
    .expect(201);
  return { agent, id: res.body.id as number };
}
