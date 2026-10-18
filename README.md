# Ping Pong Ladder

Track ping pong matches between Slalom colleagues with Elo ratings. Results only count once **both players confirm**.

- Sign in with a magic link sent to your `@slalom.com` email (no passwords).
- Record a match with game-by-game scores (best of 3 or 5, games to 11, win by 2).
- Your opponent confirms, or proposes a correction (which you then confirm or correct, and so on). Either player can withdraw a pending match.
- On confirmation, ratings update with Elo (start 1200, K = 32).
- Leaderboard, player profiles with rating chart and match history, and head-to-head stats.

## Stack

| Layer    | Tech                                                           |
| -------- | -------------------------------------------------------------- |
| Client   | React 19, Vite, TypeScript, MUI 7, React Router 7, Recharts    |
| Server   | Express 5 + TypeScript (`server/`), served as one Vercel function (`api/index.ts`) |
| Database | Postgres: Neon (prod), Docker (optional local), raw `pg`, schema in `server/src/db/init.sql` |
| Email    | Nodemailer + Gmail SMTP (App Password)                         |
| Tests    | Jest + supertest + pg-mem (server), Vitest + Testing Library (client) |

## Local development

```bash
npm run install:all
cp .env.example .env      # then fill it in (see below)
npm run db:init           # create tables (idempotent)
npm run db:seed           # optional: add 3 test opponents
npm run dev               # API on :3000, client on http://localhost:5173
```

If `SMTP_USER`/`SMTP_PASS` are empty, magic links are **printed to the server console** instead of emailed.

To use a local DB instead of Neon: `docker compose up -d` and set
`DATABASE_URL=postgresql://pingpong:pingpong@localhost:5432/pingpong`.

### Testing confirmations during the pilot

Seeded test users (`test.alice@slalom.com`, ...) have no real inbox. To act as one locally, add it to
`ALLOWED_EMAILS`, leave SMTP empty, sign in in a private window, and copy the link from the server console.

### Tests

```bash
npm test                  # server + client
```

## Environment variables

| Name             | Description                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | Neon **pooled** connection string (`...-pooler...neon.tech/neondb?sslmode=require`)     |
| `JWT_SECRET`     | Long random string (`openssl rand -hex 32`)                                              |
| `APP_URL`        | Public URL used in emailed links, e.g. `https://your-app.vercel.app`                     |
| `SMTP_HOST`      | `smtp.gmail.com`                                                                         |
| `SMTP_PORT`      | `465`                                                                                    |
| `SMTP_USER`      | Gmail address                                                                            |
| `SMTP_PASS`      | Gmail **App Password** (not your account password)                                       |
| `EMAIL_FROM`     | e.g. `Ping Pong Ladder <you@gmail.com>`                                                  |
| `ALLOWED_EMAILS` | Optional comma-separated allow-list (pilot). Empty = any `@slalom.com` address           |

### Gmail App Password

1. Turn on 2-Step Verification on the Gmail account: <https://myaccount.google.com/security>.
2. Open **App passwords**, create one named "pingpong-ladder", copy the 16-character code into `SMTP_PASS`.

Gmail allows roughly 500 messages/day. Corporate filters may quarantine mail from a `gmail.com` sender; if
that happens, swap the implementation in `server/src/lib/mailer.ts` (it's the only place that sends email).

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel. `vercel.json` already configures the build
   (static client from `client/dist`, API as the `api/index.ts` function, SPA rewrites).
2. Add all environment variables above in **Project → Settings → Environment Variables**, with `APP_URL`
   set to the Vercel URL and `NODE_ENV=production`.
3. Deploy. The schema only needs to be applied once (`npm run db:init` locally against the Neon URL).

## Project layout

```
api/index.ts                 Vercel function entry (re-exports the Express app)
server/src/app.ts            Express app (routes, error handling)
server/src/routes/           auth, matches, users / leaderboard / h2h
server/src/services/         match lifecycle (create, counter, confirm, withdraw)
server/src/lib/              elo, score validation, mailer
server/src/db/               pg pool + init.sql
server/scripts/              db:init, db:seed
client/src/pages/            Login, Verify, SetupName, Dashboard, RecordMatch, Leaderboard, Profile, HeadToHead
client/src/components/       Layout, GameScoresInput, PendingMatchCard, MatchRow
```

## Rules

- **Score validation:** each game is first to 11, win by 2 (12-10, 13-11 ... after deuce). A match is best of 3 or 5,
  and no games may be recorded after it's decided.
- **Elo:** `E = 1 / (1 + 10^((Rb − Ra) / 400))`, `Δ = round(32 · (S − E))`, zero-sum. Applied in order of confirmation.
- **Security:** login tokens are random 32 bytes, stored hashed, valid 15 minutes, single use. Verification is a POST
  from the client page, so email link scanners that pre-fetch URLs can't consume the token. Sessions are httpOnly
  JWT cookies (30 days).
