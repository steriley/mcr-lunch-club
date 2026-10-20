import { createDatabase } from '@/lib/db-client';
import { getDatabaseDriver, getMigrationDatabaseUrl } from '@/lib/env';

// Scripts use the direct (unpooled) connection.
const client = createDatabase({
  url: getMigrationDatabaseUrl(),
  driver: getDatabaseDriver(),
  maxConnections: 1,
});

export const db = client.db;
export const driver = client.driver;
export const closeDatabase = client.close;

export default db;
