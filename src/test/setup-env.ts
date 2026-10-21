/**
 * Import this first in any test that loads modules reading environment
 * variables at import time (db, auth, admin-api, public-data).
 * ES imports run in order, so the values are set before those modules load.
 */
process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.BETTER_AUTH_URL = 'https://lunch.example.com';

// Vercel sets these in its build environment; clear them so a preview build
// tests the same configuration as a local run.
for (const key of ['VERCEL_ENV', 'VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'BETTER_AUTH_ALLOWED_HOSTS']) {
  delete process.env[key];
}
