import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeonHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from '@/db/drizzle-schema';
import type { DatabaseDriver } from '@/lib/env';

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  db: Database;
  driver: DatabaseDriver;
  close: () => Promise<void>;
}

interface CreateDatabaseOptions {
  url: string;
  driver: DatabaseDriver;
  maxConnections: number;
  logger?: boolean;
}

export function createDatabase({ url, driver, maxConnections, logger = false }: CreateDatabaseOptions): DatabaseClient {
  if (driver === 'neon-http') {
    // Query the endpoint host directly rather than the regional `api.` host,
    // so only the database's own hostname needs to be reachable.
    neonConfig.fetchEndpoint = (host) => `https://${host}/sql`;
    // Both drivers expose the same Postgres query builder; only transactions differ.
    const db = drizzleNeonHttp(neon(url), { schema, logger }) as unknown as Database;
    return { db, driver, close: async () => {} };
  }

  const pool = new Pool({ connectionString: url, max: maxConnections });
  const db = drizzlePg(pool, { schema, logger });
  return { db, driver, close: () => pool.end() };
}
