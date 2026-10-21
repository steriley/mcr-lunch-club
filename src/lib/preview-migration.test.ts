import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decidePreviewMigration, neonEndpointId } from './preview-migration';

const PRODUCTION = 'ep-calm-river-111111.eu-west-2.aws.neon.tech';
const PREVIEW_URL = 'postgresql://u:p@ep-bold-sea-222222.eu-west-2.aws.neon.tech/neondb?sslmode=require';

describe('neonEndpointId', () => {
  it('matches pooled and direct hosts and full connection strings for the same endpoint', () => {
    assert.equal(neonEndpointId(PRODUCTION), 'ep-calm-river-111111');
    assert.equal(neonEndpointId('ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech'), 'ep-calm-river-111111');
    assert.equal(neonEndpointId(`postgres://u:p@${PRODUCTION}/db`), 'ep-calm-river-111111');
    assert.equal(neonEndpointId(' EP-Calm-River-111111.eu-west-2.aws.neon.tech '), 'ep-calm-river-111111');
  });
});

describe('decidePreviewMigration', () => {
  it('skips production, development and local builds', () => {
    for (const VERCEL_ENV of ['production', 'development', undefined]) {
      const decision = decidePreviewMigration({ VERCEL_ENV, DATABASE_URL: PREVIEW_URL, PRODUCTION_DATABASE_HOST: PRODUCTION });
      assert.equal(decision.run, false);
    }
  });

  it('migrates a preview branch, preferring the unpooled URL', () => {
    const decision = decidePreviewMigration({
      VERCEL_ENV: 'preview',
      DATABASE_URL: 'postgresql://u:p@ep-other-333333-pooler.eu-west-2.aws.neon.tech/neondb',
      DATABASE_URL_UNPOOLED: PREVIEW_URL,
      PRODUCTION_DATABASE_HOST: PRODUCTION,
    });
    assert.deepEqual(decision, { run: true, host: 'ep-bold-sea-222222.eu-west-2.aws.neon.tech' });
  });

  it('refuses a preview build connected to the production endpoint, pooled or direct', () => {
    for (const host of [PRODUCTION, 'ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech']) {
      assert.throws(
        () => decidePreviewMigration({ VERCEL_ENV: 'preview', DATABASE_URL: `postgresql://u:p@${host}/neondb`, PRODUCTION_DATABASE_HOST: PRODUCTION }),
        /connected to the production database/
      );
    }
  });

  it('refuses when production cannot be ruled out or there is no database', () => {
    assert.throws(() => decidePreviewMigration({ VERCEL_ENV: 'preview', DATABASE_URL: PREVIEW_URL }), /PRODUCTION_DATABASE_HOST/);
    assert.throws(() => decidePreviewMigration({ VERCEL_ENV: 'preview', PRODUCTION_DATABASE_HOST: PRODUCTION }), /No DATABASE_URL/);
  });
});
