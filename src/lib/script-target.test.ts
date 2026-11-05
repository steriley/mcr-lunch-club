import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkScriptTarget } from './script-target';

const PRODUCTION = 'ep-calm-river-111111.eu-west-2.aws.neon.tech';
const url = (host: string) => `postgresql://u:p@${host}/neondb?sslmode=require`;
const write = { writes: true, confirmedProduction: false };

describe('checkScriptTarget', () => {
  it('refuses a write to production without --production, pooled or direct', () => {
    for (const host of [PRODUCTION, 'ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech']) {
      const result = checkScriptTarget(
        { DATABASE_URL_UNPOOLED: url(host), PRODUCTION_DATABASE_HOST: PRODUCTION },
        write
      );
      assert.equal(result.proceed, false);
      assert.match(result.message, /PRODUCTION.*--production/);
    }
  });

  it('allows a production write once confirmed, and a dry run without it', () => {
    const env = { DATABASE_URL_UNPOOLED: url(PRODUCTION), PRODUCTION_DATABASE_HOST: PRODUCTION };
    assert.equal(checkScriptTarget(env, { writes: true, confirmedProduction: true }).proceed, true);
    assert.equal(
      checkScriptTarget(env, { writes: false, confirmedProduction: false }).proceed,
      true
    );
  });

  it('names a non-production database', () => {
    const result = checkScriptTarget(
      {
        DATABASE_URL_UNPOOLED: url('ep-bold-sea-222222.eu-west-2.aws.neon.tech'),
        PRODUCTION_DATABASE_HOST: PRODUCTION,
      },
      write
    );
    assert.equal(result.proceed, true);
    assert.match(result.message, /ep-bold-sea-222222.*not production/);
  });

  it('warns, but proceeds, when production cannot be identified', () => {
    const result = checkScriptTarget({ DATABASE_URL: url(PRODUCTION) }, write);
    assert.equal(result.proceed, true);
    assert.match(result.message, /PRODUCTION_DATABASE_HOST/);
  });

  it('prefers the unpooled URL, as the scripts do', () => {
    const result = checkScriptTarget(
      {
        DATABASE_URL: url(PRODUCTION),
        DATABASE_URL_UNPOOLED: url('ep-bold-sea-222222.eu-west-2.aws.neon.tech'),
        PRODUCTION_DATABASE_HOST: PRODUCTION,
      },
      write
    );
    assert.equal(result.proceed, true);
  });

  it('stops when no database is configured', () => {
    assert.equal(checkScriptTarget({}, write).proceed, false);
  });
});
