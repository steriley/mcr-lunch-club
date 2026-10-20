/**
 * Import this first in any test that loads modules reading environment
 * variables at import time (db, auth, admin-api, public-data).
 * ES imports run in order, so the values are set before those modules load.
 */
process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
process.env.BETTER_AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
process.env.BETTER_AUTH_URL = 'https://lunch.example.com';
