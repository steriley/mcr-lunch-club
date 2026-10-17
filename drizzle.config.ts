import { defineConfig } from 'drizzle-kit';
import { getMigrationDatabaseUrl } from './src/lib/env';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  dbCredentials: {
    url: getMigrationDatabaseUrl()
  }
});
