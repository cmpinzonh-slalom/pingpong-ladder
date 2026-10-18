import path from 'path';
import dotenv from 'dotenv';

// Load repo-root .env for local dev only. On Vercel, env comes exclusively from the platform settings.
if (!process.env.VERCEL) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true } as dotenv.DotenvConfigOptions);
}

function list(v: string | undefined): string[] {
  return (v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  get databaseUrl() {
    return process.env.DATABASE_URL || '';
  },
  get jwtSecret() {
    const s = process.env.JWT_SECRET;
    if (!s) {
      if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required');
      return 'dev-insecure-secret';
    }
    return s;
  },
  get appUrl() {
    return (process.env.APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  },
  get allowedEmails() {
    return list(process.env.ALLOWED_EMAILS);
  },
  /** Admins can reset other users' passwords. */
  get adminEmails() {
    return list(process.env.ADMIN_EMAILS);
  },
  allowedDomain: 'slalom.com',
  smtp: {
    get host() {
      return process.env.SMTP_HOST || 'smtp.gmail.com';
    },
    get port() {
      return Number(process.env.SMTP_PORT || 465);
    },
    get user() {
      return process.env.SMTP_USER || '';
    },
    get pass() {
      return (process.env.SMTP_PASS || '').replace(/\s+/g, '');
    },
    get from() {
      return process.env.EMAIL_FROM || process.env.SMTP_USER || '';
    },
  },
  get isProduction() {
    return process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  },
};

export const K_FACTOR = 32;
export const STARTING_RATING = 1200;
export const MIN_PASSWORD_LENGTH = 8;
export const SESSION_DAYS = 30;
