import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { decideDeployMigration, neonEndpointId } from './deploy-migration';

const PRODUCTION = 'ep-calm-river-111111.eu-west-2.aws.neon.tech';
const PRODUCTION_URL = `postgresql://u:p@${PRODUCTION}/neondb?sslmode=require`;
const PREVIEW_URL =
  'postgresql://u:p@ep-bold-sea-222222.eu-west-2.aws.neon.tech/neondb?sslmode=require';

describe('neonEndpointId', () => {
  it('matches pooled and direct hosts and full connection strings for the same endpoint', () => {
    assert.equal(neonEndpointId(PRODUCTION), 'ep-calm-river-111111');
    assert.equal(
      neonEndpointId('ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech'),
      'ep-calm-river-111111'
    );
    assert.equal(neonEndpointId(PRODUCTION_URL), 'ep-calm-river-111111');
    assert.equal(
      neonEndpointId(' EP-Calm-River-111111.eu-west-2.aws.neon.tech '),
      'ep-calm-river-111111'
    );
  });
});

describe('decideDeployMigration', () => {
  it('skips local and Vercel development builds', () => {
    for (const VERCEL_ENV of ['development', undefined]) {
      const decision = decideDeployMigration({
        VERCEL_ENV,
        DATABASE_URL: PREVIEW_URL,
        PRODUCTION_DATABASE_HOST: PRODUCTION,
      });
      assert.equal(decision.run, false);
    }
  });

  it('migrates production, preferring the unpooled URL', () => {
    const decision = decideDeployMigration({
      VERCEL_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech/neondb',
      DATABASE_URL_UNPOOLED: PRODUCTION_URL,
      PRODUCTION_DATABASE_HOST: PRODUCTION,
    });
    assert.deepEqual(decision, { run: true, target: 'production', host: PRODUCTION });
    assert.equal(
      decideDeployMigration({ VERCEL_ENV: 'production', DATABASE_URL: PRODUCTION_URL }).run,
      true
    );
  });

  it('migrates a preview branch', () => {
    const decision = decideDeployMigration({
      VERCEL_ENV: 'preview',
      DATABASE_URL_UNPOOLED: PREVIEW_URL,
      PRODUCTION_DATABASE_HOST: PRODUCTION,
    });
    assert.deepEqual(decision, {
      run: true,
      target: 'preview',
      host: 'ep-bold-sea-222222.eu-west-2.aws.neon.tech',
    });
  });

  it('refuses a preview build connected to the production endpoint, pooled or direct', () => {
    for (const host of [PRODUCTION, 'ep-calm-river-111111-pooler.eu-west-2.aws.neon.tech']) {
      assert.throws(
        () =>
          decideDeployMigration({
            VERCEL_ENV: 'preview',
            DATABASE_URL: `postgresql://u:p@${host}/neondb`,
            PRODUCTION_DATABASE_HOST: PRODUCTION,
          }),
        /connected to the production database/
      );
    }
  });

  it('refuses when production cannot be ruled out or there is no database', () => {
    assert.throws(
      () => decideDeployMigration({ VERCEL_ENV: 'preview', DATABASE_URL: PREVIEW_URL }),
      /PRODUCTION_DATABASE_HOST/
    );
    assert.throws(
      () => decideDeployMigration({ VERCEL_ENV: 'preview', PRODUCTION_DATABASE_HOST: PRODUCTION }),
      /Preview branching/
    );
    assert.throws(() => decideDeployMigration({ VERCEL_ENV: 'production' }), /production build/);
  });
});
