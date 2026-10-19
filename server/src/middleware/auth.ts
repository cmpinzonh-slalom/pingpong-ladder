import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, SESSION_DAYS } from '../config';
import { query } from '../db/database';
import { forbidden, unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'pp_session';

export interface AuthedRequest extends Request {
  userId?: number;
  /** Owner (ADMIN_EMAILS) or in-app admin. */
  isAdmin?: boolean;
  /** Listed in ADMIN_EMAILS: can grant/revoke admin; cannot be changed from the app. */
  isOwner?: boolean;
  mustChangePassword?: boolean;
}

export function issueSession(res: Response, userId: number, sessionVersion: number): void {
  const token = jwt.sign({ sub: String(userId), v: sessionVersion }, config.jwtSecret, {
    expiresIn: `${SESSION_DAYS}d`,
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function isOwnerEmail(email: string): boolean {
  return config.adminEmails.includes(email.toLowerCase());
}

export function rolesOf(u: { email: string; is_admin: boolean }): { is_owner: boolean; is_admin: boolean } {
  const owner = isOwnerEmail(u.email);
  return { is_owner: owner, is_admin: owner || !!u.is_admin };
}

/**
 * Validates the session cookie against the DB (so password resets revoke old sessions).
 * Users flagged must_change_password can only reach routes marked `allowPendingPasswordChange`.
 */
function authenticate(allowPendingPasswordChange: boolean) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) return next(unauthorized());
    let payload: { sub: string; v?: number };
    try {
      payload = jwt.verify(token, config.jwtSecret) as { sub: string; v?: number };
    } catch {
      return next(unauthorized('Session expired, please sign in again'));
    }
    try {
      const { rows } = await query<{
        email: string;
        session_version: number;
        must_change_password: boolean;
        is_admin: boolean;
      }>(
        `SELECT email, session_version, must_change_password, is_admin FROM users WHERE id = $1`,
        [Number(payload.sub)]
      );
      const u = rows[0];
      if (!u || u.session_version !== (payload.v ?? 0)) {
        return next(unauthorized('Session expired, please sign in again'));
      }
      req.userId = Number(payload.sub);
      const roles = rolesOf(u);
      req.isAdmin = roles.is_admin;
      req.isOwner = roles.is_owner;
      req.mustChangePassword = u.must_change_password;
      if (u.must_change_password && !allowPendingPasswordChange) {
        return next(forbidden('You must choose a new password before continuing'));
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const requireAuth = authenticate(false);
export const requireAuthAllowPasswordChange = authenticate(true);

export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.isAdmin) return next(forbidden('Admins only'));
  next();
}

export function requireOwner(req: AuthedRequest, _res: Response, next: NextFunction): void {
  if (!req.isOwner) return next(forbidden('Only owners can do this'));
  next();
}
