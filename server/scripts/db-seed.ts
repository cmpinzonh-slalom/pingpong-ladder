/**
 * Seeds a few dummy opponents so the app can be tested in pilot mode
 * (when ALLOWED_EMAILS restricts real sign-ins). Dummy users cannot log in
 * unless added to ALLOWED_EMAILS.
 */
import { getPool } from '../src/db/database';

const DUMMIES = [
  ['test.alice@slalom.com', 'Alice (test)'],
  ['test.bob@slalom.com', 'Bob (test)'],
  ['test.carol@slalom.com', 'Carol (test)'],
];

async function main(): Promise<void> {
  const pool = getPool();
  for (const [email, name] of DUMMIES) {
    await pool.query(
      `INSERT INTO users (email, display_name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING`,
      [email, name]
    );
  }
  console.log(`Seeded ${DUMMIES.length} test users.`);
  await pool.end();
}

main().catch((err) => {
  console.error('db:seed failed:', err);
  process.exit(1);
});
