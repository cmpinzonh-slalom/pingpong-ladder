import fs from 'fs';
import path from 'path';
import { getPool } from '../src/db/database';

async function main(): Promise<void> {
  const sql = fs.readFileSync(path.join(__dirname, '../src/db/init.sql'), 'utf8');
  const pool = getPool();
  console.log('Applying schema to', process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':****@'));
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
}

main().catch((err) => {
  console.error('db:init failed:', err);
  process.exit(1);
});
