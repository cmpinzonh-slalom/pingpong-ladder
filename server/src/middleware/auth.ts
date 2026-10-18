import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, SESSION_DAYS } from '../config';
import { unauthorized } from '../lib/errors';

export const SESSION_COOKIE = 'pp_session';

export interface AuthedRequest extends Request {
  userId?: number;
}

export function issueSession(res: Response, userId: number): void {
  const token = jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: `${SESSION_DAYS}d` });
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

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next(unauthorized());
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.userId = Number(payload.sub);
    next();
  } catch {
    next(unauthorized('Session expired, please sign in again'));
  }
}
