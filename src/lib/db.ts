import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { schema } from '@/db/drizzle-schema';
import { getRuntimeDatabaseUrl, isDevelopment, isProduction } from '@/lib/env';

const databaseUrl = getRuntimeDatabaseUrl();

export const pool = new Pool({
  connectionString: databaseUrl,
  max: 5,
  ssl: isProduction() ? { rejectUnauthorized: false } : undefined
});

export { schema };

export const db = drizzle(pool, {
  schema,
  logger: isDevelopment()
});

export default db;
