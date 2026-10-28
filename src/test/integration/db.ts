import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { user } from '@/db/auth-schema';
import { venues } from '@/db/schema';
import { createDatabase, type DatabaseClient } from '@/lib/db-client';

/**
 * Opt-in integration tests against a real Postgres, for rules that depend on
 * transactions, row locks and constraints (stubs cannot prove those).
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/lunch_test pnpm test:db
 *
 * The database is migrated and its tables TRUNCATED, so it must be a
 * throwaway: the URL must point at localhost and the database name must
 * contain "test". They only run through `pnpm test:db` (one file at a time,
 * since they share the database); plain `pnpm test` skips them.
 */

const url = process.env.TEST_DATABASE_URL;
const enabled = process.env.DB_INTEGRATION === '1';

function unsafeReason(value: string): string | null {
  const parsed = new URL(value);
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname))
    return `host ${parsed.hostname} is not local`;
  if (!parsed.pathname.toLowerCase().includes('test'))
    return 'the database name does not contain "test"';
  return null;
}

export const skipIntegration: string | false = !enabled
  ? 'database integration tests run with `pnpm test:db`'
  : !url
    ? 'set TEST_DATABASE_URL to run database integration tests'
    : unsafeReason(url)
      ? `refusing TEST_DATABASE_URL: ${unsafeReason(url)}`
      : false;

let client: DatabaseClient | null = null;

export async function testDb(): Promise<DatabaseClient['db']> {
  if (!client) {
    client = createDatabase({ url: url!, driver: 'pg', maxConnections: 6 });
    await migrate(client.db, { migrationsFolder: './drizzle' });
  }
  return client.db;
}

export async function closeTestDb(): Promise<void> {
  await client?.close();
  client = null;
}

export async function resetTestDb(): Promise<void> {
  const db = await testDb();
  await db.execute(sql`truncate table ${venues}, ${user} restart identity cascade`);
}

export interface TestAdmin {
  id: string;
  name: string;
  email: string;
}

export async function createAdmin(
  id: string,
  name: string,
  options: { banned?: boolean; role?: string } = {}
): Promise<TestAdmin> {
  const db = await testDb();
  const admin = { id, name, email: `${id}@example.com` };
  await db
    .insert(user)
    .values({ ...admin, role: options.role ?? 'admin', banned: options.banned ?? false });
  return admin;
}

export async function createVenue(
  name = 'Chip Shop',
  overrides: Partial<typeof venues.$inferInsert> = {}
): Promise<string> {
  const db = await testDb();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [row] = await db
    .insert(venues)
    .values({
      name,
      slug,
      tier: 'to_be_assessed',
      latitude: '53.480000',
      longitude: '-2.250000',
      ...overrides,
    })
    .returning({ id: venues.id });
  return row.id;
}

/** For assert.rejects: the error (or its Drizzle-wrapped cause) names this constraint. */
export function violates(constraint: string) {
  return (error: unknown) => {
    for (let current: any = error; current; current = current.cause) {
      if (current.constraint === constraint) return true;
    }
    return false;
  };
}
