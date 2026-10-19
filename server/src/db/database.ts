import { Pool, types, PoolClient, QueryResult, QueryResultRow } from 'pg';

// Return DATE columns as plain 'YYYY-MM-DD' strings instead of local-midnight Dates,
// so calendar dates never shift with the server's time zone.
types.setTypeParser(1082, (v: string) => v);
import { config } from '../config';

let pool: Pool | null = null;

function buildPool(): Pool {
  const connectionString = config.databaseUrl;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set.');
  }
  // Neon uses publicly trusted certs, so verify them. We strip sslmode/channel_binding from the
  // URL and configure TLS explicitly to avoid pg's ambiguous sslmode semantics warning.
  const url = new URL(connectionString);
  const wantsSsl = url.searchParams.get('sslmode') === 'require' || /neon\.tech$/i.test(url.hostname);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('channel_binding');
  return new Pool({
    connectionString: url.toString(),
    ssl: wantsSsl ? { rejectUnauthorized: true } : undefined,
    max: 5,
  });
}

export function getPool(): Pool {
  if (!pool) pool = buildPool();
  return pool;
}

/** Test-only: inject a mock pool (e.g. pg-mem). */
export function setPoolForTesting(p: Pool | null): void {
  pool = p;
}

export type Queryable = Pick<Pool | PoolClient, 'query'>;

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as never[]);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
