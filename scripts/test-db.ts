/**
 * Runs the database integration tests (src/test/integration) one file at a
 * time against TEST_DATABASE_URL, a throwaway local database.
 *
 *   pnpm db:local && pnpm test:db     (TEST_DATABASE_URL comes from .env.local)
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/lunch_test pnpm test:db
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// `pnpm db:local` writes TEST_DATABASE_URL to .env.local. Take only that one value from it: the tests
// set up the rest of their environment themselves (src/test/setup-env.ts).
if (!process.env.TEST_DATABASE_URL && existsSync('.env.local')) {
  const fromFile = parseEnv(readFileSync('.env.local', 'utf8')).TEST_DATABASE_URL;
  if (fromFile) process.env.TEST_DATABASE_URL = fromFile;
}

if (!process.env.TEST_DATABASE_URL) {
  console.error('Set TEST_DATABASE_URL to a throwaway local database whose name contains "test".');
  process.exit(1);
}

const result = spawnSync('tsx', ['--test', '--test-concurrency=1', 'src/test/integration/*.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DB_INTEGRATION: '1' },
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
