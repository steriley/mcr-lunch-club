import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from '@/db/drizzle-schema';
import { getMigrationDatabaseUrl } from '@/lib/env';

export const pool = new Pool({
  connectionString: getMigrationDatabaseUrl(),
  max: 1,
});

export const db = drizzle(pool, { schema });

export default db;
