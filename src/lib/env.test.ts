import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getAuthEnvironment,
  getBlobToken,
  getDatabaseDriver,
  getMigrationDatabaseUrl,
  getPublicMapApiKey,
  getRuntimeDatabaseUrl,
  getSeedChairEnvironment,
  getWeatherApiKey,
  isDevelopment,
  isProduction,
} from './env';

const KEYS = [
  'DATABASE_URL',
  'DATABASE_URL_UNPOOLED',
  'DATABASE_DRIVER',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'SEED_CHAIR_EMAIL',
  'SEED_CHAIR_PASSWORD',
  'SEED_CHAIR_NAME',
  'NODE_ENV',
  'METOFFICE_API_KEY',
  'WEATHER_API_KEY',
  'PUBLIC_MAP_API_KEY',
  'BLOB_READ_WRITE_TOKEN',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('database URLs', () => {
  it('requires DATABASE_URL and validates its protocol', () => {
    assert.throws(() => getRuntimeDatabaseUrl(), /Missing required environment variable: DATABASE_URL/);
    process.env.DATABASE_URL = '   ';
    assert.throws(() => getRuntimeDatabaseUrl(), /Missing required/);
    process.env.DATABASE_URL = 'not a url';
    assert.throws(() => getRuntimeDatabaseUrl(), /valid PostgreSQL URL/);
    process.env.DATABASE_URL = 'mysql://localhost/db';
    assert.throws(() => getRuntimeDatabaseUrl(), /postgres or postgresql protocol/);
    process.env.DATABASE_URL = 'postgresql://u:p@localhost/db';
    assert.equal(getRuntimeDatabaseUrl(), 'postgresql://u:p@localhost/db');
  });

  it('prefers the unpooled URL for migrations and falls back to DATABASE_URL', () => {
    assert.throws(() => getMigrationDatabaseUrl(), /DATABASE_URL_UNPOOLED/);
    process.env.DATABASE_URL = 'postgres://pooled/db';
    assert.equal(getMigrationDatabaseUrl(), 'postgres://pooled/db');
    process.env.DATABASE_URL_UNPOOLED = 'postgres://direct/db';
    assert.equal(getMigrationDatabaseUrl(), 'postgres://direct/db');
    process.env.DATABASE_URL_UNPOOLED = 'http://direct/db';
    assert.throws(() => getMigrationDatabaseUrl(), /DATABASE_URL_UNPOOLED must use/);
  });
});

describe('getDatabaseDriver', () => {
  it('defaults to pg and accepts neon-http', () => {
    assert.equal(getDatabaseDriver(), 'pg');
    process.env.DATABASE_DRIVER = 'neon-http';
    assert.equal(getDatabaseDriver(), 'neon-http');
  });

  it('rejects unknown drivers', () => {
    process.env.DATABASE_DRIVER = 'sqlite';
    assert.throws(() => getDatabaseDriver(), /DATABASE_DRIVER/);
  });
});

describe('getAuthEnvironment', () => {
  it('requires a long secret and a valid http(s) URL', () => {
    assert.throws(() => getAuthEnvironment(), /BETTER_AUTH_SECRET/);
    process.env.BETTER_AUTH_SECRET = 'short';
    assert.throws(() => getAuthEnvironment(), /at least 32 characters/);
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
    assert.throws(() => getAuthEnvironment(), /BETTER_AUTH_URL/);
    process.env.BETTER_AUTH_URL = 'nope';
    assert.throws(() => getAuthEnvironment(), /valid absolute URL/);
    process.env.BETTER_AUTH_URL = 'ftp://example.com';
    assert.throws(() => getAuthEnvironment(), /http or https/);
    process.env.BETTER_AUTH_URL = 'https://example.com';
    assert.deepEqual(getAuthEnvironment(), { secret: 'x'.repeat(32), url: 'https://example.com' });
  });
});

describe('getSeedChairEnvironment', () => {
  it('requires email and password and defaults the name', () => {
    assert.throws(() => getSeedChairEnvironment(), /SEED_CHAIR_EMAIL/);
    process.env.SEED_CHAIR_EMAIL = 'chair@example.com';
    assert.throws(() => getSeedChairEnvironment(), /SEED_CHAIR_PASSWORD/);
    process.env.SEED_CHAIR_PASSWORD = 'secret';
    assert.deepEqual(getSeedChairEnvironment(), { email: 'chair@example.com', password: 'secret', name: 'Chair' });
    process.env.SEED_CHAIR_NAME = 'Big Chair';
    assert.equal(getSeedChairEnvironment().name, 'Big Chair');
  });
});

describe('environment mode', () => {
  it('distinguishes production from development', () => {
    process.env.NODE_ENV = 'production';
    assert.equal(isProduction(), true);
    assert.equal(isDevelopment(), false);
    process.env.NODE_ENV = 'development';
    assert.equal(isProduction(), false);
    assert.equal(isDevelopment(), true);
  });
});

describe('optional keys', () => {
  it('return undefined when unset or blank', () => {
    assert.equal(getWeatherApiKey(), undefined);
    assert.equal(getPublicMapApiKey(), undefined);
    assert.equal(getBlobToken(), undefined);
    process.env.PUBLIC_MAP_API_KEY = '  ';
    assert.equal(getPublicMapApiKey(), undefined);
  });

  it('prefer METOFFICE_API_KEY over WEATHER_API_KEY and trim values', () => {
    process.env.WEATHER_API_KEY = 'fallback';
    assert.equal(getWeatherApiKey(), 'fallback');
    process.env.METOFFICE_API_KEY = ' primary ';
    assert.equal(getWeatherApiKey(), 'primary');
    process.env.BLOB_READ_WRITE_TOKEN = 'tok';
    assert.equal(getBlobToken(), 'tok');
  });
});
