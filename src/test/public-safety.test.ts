import './setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { toPublicVenue } from '@/lib/public-data';
import type { VenueRow } from '@/db/schema';

/**
 * Tier proposals and decline reasons are internal. Public code reads
 * venues.tier only: no public page, public API route or public serializer
 * may touch proposal data.
 */

const ROOT = path.resolve('src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(astro|ts|vue)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

const publicFiles = [
  ...files(path.join(ROOT, 'pages')).filter((file) => !/[\\/]admin[\\/]/.test(file) && !file.includes(`${path.sep}auth${path.sep}`)),
  ...files(path.join(ROOT, 'components')).filter((file) => !/(Venue(Form|Table|Closure)|Proposal|TierProposal|VisitedToday|PlaceSearch|Suggestion|User|Bribery|Admin|Login|Session|ChangePassword|ImageUpload|ConfirmDialog|TierBadge)/.test(path.basename(file))),
  path.join(ROOT, 'lib/public-data.ts'),
  path.join(ROOT, 'layouts/Layout.astro'),
];

const FORBIDDEN = [/tier[_-]?proposals?/i, /tierProposal/, /decline[_-]?reason/i, /declineReason/, /lib\/tier-proposals/, /proposedTier/];

describe('public code never touches tier proposals', () => {
  it('checks the public pages, API routes, components and serializers', () => {
    assert.ok(publicFiles.some((file) => file.endsWith(`pages${path.sep}index.astro`)));
    assert.ok(publicFiles.some((file) => file.endsWith(`venues.json.ts`)));
    assert.ok(publicFiles.some((file) => file.endsWith(`suggestions.ts`) && file.includes(`${path.sep}api${path.sep}`)));
  });

  for (const file of publicFiles) {
    it(path.relative(ROOT, file), () => {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) assert.doesNotMatch(source, pattern);
    });
  }

  it('the public venue serializer outputs only public fields', () => {
    const row = {
      id: 'uuid', slug: 'chip-shop', name: 'Chip Shop', tier: 'approved', address: '1 High St', latitude: '53.48', longitude: '-2.25',
      pullQuote: null, lunchSpecial: 'Chips', websiteUrl: null, imageUrl: null, cost: '££', cuisine: 'fish_and_chips',
      distanceMiles: '0.40', walkingTimeMin: 9, routeUpdatedAt: null, lastInspectionDate: '2026-09-01', mapSearchLink: null,
      closedAt: null, closedBy: 'admin-1', createdAt: new Date(), updatedAt: new Date(), updatedBy: 'admin-1',
    } as unknown as VenueRow & { tier: 'approved' };
    assert.deepEqual(Object.keys(toPublicVenue(row)).sort(), [
      'address', 'closed', 'cost', 'cuisine', 'distanceMiles', 'eatLikeUs', 'id', 'imageUrl', 'lastInspectionDate', 'lat', 'lng',
      'mapSearchLink', 'name', 'slug', 'status', 'walkingTimeMin',
    ]);
  });
});
