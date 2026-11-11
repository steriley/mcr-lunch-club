import '../setup-env';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GET as VENUE_SWING } from '@/pages/api/public/venues/[slug]/swing';
import { GET as THE_COUNT } from '@/pages/api/public/the-count';
import { GET as REFRESH } from '@/pages/api/cron/refresh-scores';

/** The Swing-o-meter's routes (#138) exist only while the `members` flag is on. */

const savedFlag = process.env.MEMBERS_FLAG;
const savedSecret = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'cron-secret';
});

afterEach(() => {
  if (savedFlag === undefined) delete process.env.MEMBERS_FLAG;
  else process.env.MEMBERS_FLAG = savedFlag;
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

const venueSwing = (slug: string) =>
  VENUE_SWING({
    params: { slug },
    request: new Request(`https://lunch.example.com/api/public/venues/${slug}/swing`),
  } as any) as Promise<Response>;

describe('the Swing-o-meter routes', () => {
  it('answer 404 with the members flag off', async () => {
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await venueSwing('chip-shop')).status, 404);
    assert.equal(
      (
        (await THE_COUNT({
          request: new Request('https://lunch.example.com/api/public/the-count'),
        } as any)) as Response
      ).status,
      404
    );
  });

  it('refuse a slug that is not a slug', async () => {
    process.env.MEMBERS_FLAG = 'on';
    assert.equal((await venueSwing('Not A Slug')).status, 404);
    assert.equal((await venueSwing('')).status, 404);
  });

  it('keep the refresh behind the cron secret, and idle with the flag off', async () => {
    const call = (authorization?: string) =>
      REFRESH({
        request: new Request('https://lunch.example.com/api/cron/refresh-scores', {
          headers: authorization ? { authorization } : {},
        }),
      } as any) as Promise<Response>;
    process.env.MEMBERS_FLAG = 'off';
    assert.equal((await call()).status, 401);
    assert.equal((await call('Bearer wrong')).status, 401);
    const idle = await call('Bearer cron-secret');
    assert.equal(idle.status, 200);
    assert.deepEqual(await idle.json(), { skipped: 'members flag is off' });
  });
});
