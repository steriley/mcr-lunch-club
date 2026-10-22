import { createDatabase } from '@/lib/db-client';
import { getDatabaseDriver, getRuntimeDatabaseUrl, isDevelopment } from '@/lib/env';

// Runtime connection: Neon's pooled URL with a small pool per serverless instance.
const client = createDatabase({
  url: getRuntimeDatabaseUrl(),
  driver: getDatabaseDriver(),
  maxConnections: 5,
  logger: isDevelopment() && process.env.DATABASE_LOG === 'true',
});

export const db = client.db;

export default db;
