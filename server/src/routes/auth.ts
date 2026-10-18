import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config, MIN_PASSWORD_LENGTH } from '../config';
import { query } from '../db/database';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors';
import {
  AuthedRequest,
  clearSession,
  isAdminEmail,
  issueSession,
  requireAdmin,
  requireAuth,
  requireAuthAllowPasswordChange,
} from '../middleware/auth';

const router = Router();
const BCRYPT_ROUNDS = 10;
// Compared against when the email doesn't exist, so response time doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

interface UserAuthRow {
  id: number;
  email: string;
  display_name: string | null;
  rating: number;
  password_hash: string | null;
  must_change_password: boolean;
  session_version: number;
}

export function checkEmailAllowed(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) throw badRequest('Enter a valid email address');
  if (!email.endsWith(`@${config.allowedDomain}`)) {
    throw forbidden(`Only @${config.allowedDomain} email addresses can sign up`);
  }
  const allow = config.allowedEmails;
  if (allow.length > 0 && !allow.includes(email)) {
    throw forbidden('Sign-ups are currently limited to pilot users');
  }
  return email;
}

function checkPassword(pw: unknown): string {
  const p = typeof pw === 'string' ? pw : '';
  if (p.length < MIN_PASSWORD_LENGTH) throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  if (p.length > 200) throw badRequest('Password is too long');
  return p;
}

function checkDisplayName(raw: unknown): string {
  const name = String(raw ?? '').trim();
  if (name.length < 2 || name.length > 40) throw badRequest('Display name must be 2-40 characters');
  return name;
}

/** Readable temporary password, e.g. "kq7m-x3vp-9rta". */
function generateTempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

function meResponse(u: UserAuthRow) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    rating: u.rating,
    is_admin: isAdminEmail(u.email),
    must_change_password: u.must_change_password,
  };
}

async function loadUser(id: number): Promise<UserAuthRow> {
  const { rows } = await query<UserAuthRow>(`SELECT * FROM users WHERE id = $1`, [id]);
  if (rows.length === 0) throw notFound('User not found');
  return rows[0];
}

router.post('/auth/register', async (req, res) => {
  const email = checkEmailAllowed(String(req.body?.email ?? ''));
  const password = checkPassword(req.body?.password);
  const name = checkDisplayName(req.body?.display_name);
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await query<UserAuthRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  let user: UserAuthRow;
  if (existing.rows.length > 0) {
    // Accounts created before passwords existed (no hash yet) can be claimed once.
    if (existing.rows[0].password_hash) {
      throw conflict('An account with this email already exists. Sign in, or ask an admin to reset your password.');
    }
    const upd = await query<UserAuthRow>(
      `UPDATE users SET password_hash = $1, display_name = $2 WHERE id = $3 AND password_hash IS NULL RETURNING *`,
      [hash, name, existing.rows[0].id]
    );
    if (upd.rows.length === 0) throw conflict('An account with this email already exists.');
    user = upd.rows[0];
  } else {
    const ins = await query<UserAuthRow>(
      `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [email, name, hash]
    );
    if (ins.rows.length === 0) throw conflict('An account with this email already exists.');
    user = ins.rows[0];
  }
  issueSession(res, user.id, user.session_version);
  res.status(201).json(meResponse(user));
});

router.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const { rows } = await query<UserAuthRow>(`SELECT * FROM users WHERE email = $1`, [email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !user.password_hash || !ok) throw unauthorized('Invalid email or password');
  issueSession(res, user.id, user.session_version);
  res.json(meResponse(user));
});

router.post('/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuthAllowPasswordChange, async (req: AuthedRequest, res) => {
  res.json(meResponse(await loadUser(req.userId!)));
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  const name = checkDisplayName(req.body?.display_name);
  await query(`UPDATE users SET display_name = $1 WHERE id = $2`, [name, req.userId]);
  res.json(meResponse(await loadUser(req.userId!)));
});

/**
 * Change own password. The current password is required, except right after an admin
 * reset (the user just signed in with the temporary password).
 */
router.post('/me/password', requireAuthAllowPasswordChange, async (req: AuthedRequest, res) => {
  const user = await loadUser(req.userId!);
  const newPassword = checkPassword(req.body?.new_password);
  if (!user.must_change_password) {
    const current = String(req.body?.current_password ?? '');
    if (!user.password_hash || !(await bcrypt.compare(current, user.password_hash))) {
      throw badRequest('Current password is incorrect');
    }
  }
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const { rows } = await query<UserAuthRow>(
    `UPDATE users SET password_hash = $1, must_change_password = FALSE, session_version = session_version + 1
     WHERE id = $2 RETURNING *`,
    [hash, user.id]
  );
  // Other devices are signed out; keep this one signed in.
  issueSession(res, rows[0].id, rows[0].session_version);
  res.json(meResponse(rows[0]));
});

router.get('/admin/users', requireAuth, requireAdmin, async (_req, res) => {
  const { rows } = await query<UserAuthRow & { created_at: Date }>(
    `SELECT * FROM users ORDER BY LOWER(COALESCE(display_name, email))`
  );
  res.json(
    rows.map((u) => ({
      id: u.id,
      email: u.email,
      display_name: u.display_name,
      rating: u.rating,
      has_password: !!u.password_hash,
      must_change_password: u.must_change_password,
      created_at: u.created_at,
    }))
  );
});

/** Admin sets a temporary password; the user must change it on next sign-in. Revokes existing sessions. */
router.post('/admin/users/:id/reset-password', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw badRequest('Invalid user id');
  if (id === req.userId) throw badRequest('Use "Change password" to change your own password');
  const temp = generateTempPassword();
  const hash = await bcrypt.hash(temp, BCRYPT_ROUNDS);
  const { rows } = await query<UserAuthRow>(
    `UPDATE users SET password_hash = $1, must_change_password = TRUE, session_version = session_version + 1
     WHERE id = $2 RETURNING *`,
    [hash, id]
  );
  if (rows.length === 0) throw notFound('User not found');
  res.json({ email: rows[0].email, temporary_password: temp });
});

export default router;
