import { createDatabase } from '@/lib/db-client';
import { getDatabaseDriver, getScriptDatabase } from '@/lib/env';

// Scripts use the direct (unpooled) connection. DB_TARGET picks a saved preview or production URL.
const database = getScriptDatabase(process.argv.includes('--production'));
if (database.target) {
  console.log(`[db] target: ${database.target} (${new URL(database.url).hostname})`);
}
const client = createDatabase({
  url: database.url,
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
