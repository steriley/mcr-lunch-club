import { createDatabase } from '@/lib/db-client';
import { getDatabaseDriver, getMigrationDatabaseUrl } from '@/lib/env';

// Scripts use the direct (unpooled) connection.
const client = createDatabase({
  url: getMigrationDatabaseUrl(),
  driver: getDatabaseDriver(),
  maxConnections: 1,
  // Migrations report what they changed with RAISE NOTICE.
  onNotice: (message) => {
    if (!message.endsWith(', skipping')) console.log(`[db] ${message}`);
  },
});

export const db = client.db;
export const driver = client.driver;
export const closeDatabase = client.close;

export default db;
