import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkScriptTarget } from './script-target';

const PRODUCTION = 'ep-calm-river-111111.eu-west-2.aws.neon.tech';
const POOLED = 'ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech';
const DEV = 'ep-bold-sea-222222.eu-west-2.aws.neon.tech';
const url = (host: string) => `postgresql://u:p@${host}/neondb?sslmode=require`;
const write = { writes: true, confirmedProduction: false };
const confirmed = { writes: true, confirmedProduction: true };
const dryRun = { writes: false, confirmedProduction: false };

describe('checkScriptTarget', () => {
  it('refuses a write to production without --production, pooled or direct', () => {
    for (const host of [PRODUCTION, POOLED]) {
      const result = checkScriptTarget(
        { DATABASE_URL_UNPOOLED: url(host), PRODUCTION_DATABASE_HOST: PRODUCTION },
        write
      );
      assert.equal(result.proceed, false);
      assert.match(result.message, /PRODUCTION.*--production/);
    }
  });

  it('allows a production write once confirmed, and a dry run without the flag', () => {
    const env = { DATABASE_URL_UNPOOLED: url(PRODUCTION), PRODUCTION_DATABASE_HOST: PRODUCTION };
    assert.equal(checkScriptTarget(env, confirmed).proceed, true);
    assert.match(checkScriptTarget(env, confirmed).message, /\(PRODUCTION\)/);
    assert.equal(checkScriptTarget(env, dryRun).proceed, true);
  });

  it('stops --production when the target is not production (the silent .env.local fall back)', () => {
    const result = checkScriptTarget(
      { DATABASE_URL_UNPOOLED: url(DEV), PRODUCTION_DATABASE_HOST: PRODUCTION },
      confirmed
    );
    assert.equal(result.proceed, false);
    assert.match(result.message, new RegExp(`${DEV}.*not production.*--production`));
    // Also for a dry run: the flag says production was meant.
    assert.equal(
      checkScriptTarget(
        { DATABASE_URL_UNPOOLED: url(DEV), PRODUCTION_DATABASE_HOST: PRODUCTION },
        { writes: false, confirmedProduction: true }
      ).proceed,
      false
    );
  });

  it('stops --production when production cannot be identified', () => {
    const result = checkScriptTarget({ DATABASE_URL: url(PRODUCTION) }, confirmed);
    assert.equal(result.proceed, false);
    assert.match(result.message, /PRODUCTION_DATABASE_HOST/);
  });

  it('names a non-production database and lets it be written', () => {
    const result = checkScriptTarget(
      { DATABASE_URL_UNPOOLED: url(DEV), PRODUCTION_DATABASE_HOST: PRODUCTION },
      write
    );
    assert.equal(result.proceed, true);
    assert.match(result.message, /ep-bold-sea-222222.*not production/);
  });

  it('refuses a non-local write when PRODUCTION_DATABASE_HOST is unset, but allows a dry run', () => {
    const env = { DATABASE_URL: url(PRODUCTION) };
    const refused = checkScriptTarget(env, write);
    assert.equal(refused.proceed, false);
    assert.match(refused.message, /PRODUCTION_DATABASE_HOST is not set/);
    const dry = checkScriptTarget(env, dryRun);
    assert.equal(dry.proceed, true);
    assert.match(dry.message, /cannot tell/);
  });

  it('allows a local database without PRODUCTION_DATABASE_HOST', () => {
    for (const host of ['localhost:5432', '127.0.0.1:5432', '[::1]:5432']) {
      const result = checkScriptTarget(
        { DATABASE_URL: `postgres://postgres:postgres@${host}/lunch` },
        write
      );
      assert.equal(result.proceed, true, host);
      assert.match(result.message, /local/);
    }
  });

  it('prefers the unpooled URL, as the scripts do', () => {
    const result = checkScriptTarget(
      {
        DATABASE_URL: url(PRODUCTION),
        DATABASE_URL_UNPOOLED: url(DEV),
        PRODUCTION_DATABASE_HOST: PRODUCTION,
      },
      write
    );
    assert.equal(result.proceed, true);
    assert.match(result.message, /ep-bold-sea/);
  });

  it('stops when no database is configured, or the URL is malformed', () => {
    assert.equal(checkScriptTarget({}, write).proceed, false);
    assert.equal(checkScriptTarget({ DATABASE_URL: 'not a url' }, write).proceed, false);
  });
});
