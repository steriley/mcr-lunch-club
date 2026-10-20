/**
 * Runs the database integration tests (src/test/integration) one file at a
 * time against TEST_DATABASE_URL, a throwaway local database.
 *
 *   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/lunch_test pnpm test:db
 */
import { spawnSync } from 'node:child_process';

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
