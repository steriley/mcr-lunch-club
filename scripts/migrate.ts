import { migrate as migrateNeonHttp } from 'drizzle-orm/neon-http/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { closeDatabase, db, driver } from '@/lib/db-script';

// Applies the committed migrations in ./drizzle using the same bookkeeping
// table as drizzle-kit, so either tool can be used against a database.
const config = { migrationsFolder: './drizzle' };

if (driver === 'neon-http') {
  await migrateNeonHttp(db as unknown as Parameters<typeof migrateNeonHttp>[0], config);
} else {
  await migratePg(db, config);
}

console.log(`Migrations applied (${driver}).`);
await closeDatabase();
