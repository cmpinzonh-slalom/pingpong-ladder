import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config, LOGIN_TOKEN_TTL_MIN } from '../config';
import { query } from '../db/database';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { sendMail } from '../lib/mailer';
import { AuthedRequest, clearSession, issueSession, requireAuth } from '../middleware/auth';

const router = Router();

const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export function checkEmailAllowed(rawEmail: string): string {
  const email = rawEmail.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success) throw badRequest('Enter a valid email address');
  if (!email.endsWith(`@${config.allowedDomain}`)) {
    throw forbidden(`Only @${config.allowedDomain} email addresses can sign in`);
  }
  const allow = config.allowedEmails;
  if (allow.length > 0 && !allow.includes(email)) {
    throw forbidden('Sign-ups are currently limited to pilot users');
  }
  return email;
}

router.post('/auth/request-link', async (req, res) => {
  const email = checkEmailAllowed(String(req.body?.email ?? ''));
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + LOGIN_TOKEN_TTL_MIN * 60 * 1000);
  await query(`INSERT INTO login_tokens (token_hash, email, expires_at) VALUES ($1, $2, $3)`, [
    hash(token),
    email,
    expires,
  ]);
  const link = `${config.appUrl}/auth/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: 'Your Ping Pong Ladder sign-in link',
    text: `Click to sign in (valid for ${LOGIN_TOKEN_TTL_MIN} minutes):\n\n${link}\n\nIf you didn't request this, ignore this email.`,
    html: `<p>Click to sign in to <b>Ping Pong Ladder</b> (valid for ${LOGIN_TOKEN_TTL_MIN} minutes):</p>
<p><a href="${link}">Sign in</a></p><p style="color:#888">If you didn't request this, ignore this email.</p>`,
  });
  res.json({ ok: true });
});

// POST (not GET) so that email link scanners pre-fetching the URL can't consume the token.
router.post('/auth/verify', async (req, res) => {
  const token = String(req.body?.token ?? '');
  if (!token) throw badRequest('Missing token');
  const { rows } = await query<{ id: number; email: string }>(
    `UPDATE login_tokens SET used_at = NOW()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING id, email`,
    [hash(token)]
  );
  if (rows.length === 0) throw badRequest('This sign-in link is invalid or has expired');
  const email = rows[0].email;

  await query(`INSERT INTO users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email]);
  const user = await query<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [email]);
  issueSession(res, user.rows[0].id);
  res.json({ ok: true });
});

router.post('/auth/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await query(`SELECT id, email, display_name, rating FROM users WHERE id = $1`, [req.userId]);
  if (rows.length === 0) throw notFound('User not found');
  res.json(rows[0]);
});

router.patch('/me', requireAuth, async (req: AuthedRequest, res) => {
  const name = String(req.body?.display_name ?? '').trim();
  if (name.length < 2 || name.length > 40) throw badRequest('Display name must be 2-40 characters');
  const { rows } = await query(
    `UPDATE users SET display_name = $1 WHERE id = $2 RETURNING id, email, display_name, rating`,
    [name, req.userId]
  );
  res.json(rows[0]);
});

export default router;
