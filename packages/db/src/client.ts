import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const pool = new pg.Pool({ connectionString, max: opts.max ?? 10 });
  // Verbindungsfehler im Leerlauf dürfen den Prozess nicht abstürzen lassen.
  pool.on('error', () => {});
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
