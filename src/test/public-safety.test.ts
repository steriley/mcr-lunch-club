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
 * may touch proposal data. Visits and field notes are internal too (v1): no
 * public page, component or serializer may touch their tables or modules.
 */

const ROOT = path.resolve('src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory()
      ? files(full)
      : /\.(astro|ts|vue)$/.test(entry.name) && !entry.name.endsWith('.test.ts')
        ? [full]
        : [];
  });
}

const publicFiles = [
  ...files(path.join(ROOT, 'pages')).filter(
    (file) => !/[\\/]admin[\\/]/.test(file) && !file.includes(`${path.sep}auth${path.sep}`)
  ),
  ...files(path.join(ROOT, 'components')).filter(
    (file) =>
      !/(Venue(Form|Table|Closure)|Proposal|TierProposal|Pending|VisitedToday|PlaceSearch|Suggestion|User|Bribery|Admin|Login|Session|ChangePassword|ImageUpload|ConfirmDialog|TierBadge|VenueVisits)/.test(
        path.basename(file)
      )
  ),
  path.join(ROOT, 'lib/public-data.ts'),
  path.join(ROOT, 'layouts/Layout.astro'),
];

const FORBIDDEN = [
  /tier[_-]?proposals?/i,
  /tierProposal/,
  /decline[_-]?reason/i,
  /declineReason/,
  /lib\/tier-proposals/,
  /proposedTier/,
];

/** Visits and field notes (src/lib/visits.ts, src/lib/field-notes.ts). */
const VISIT_FORBIDDEN = [
  /venue_visits/,
  /venueVisits/,
  /visit_notes/,
  /visitNotes/,
  /lib\/visits(\.ts)?['"]/,
  /field-notes/,
  /VenueVisits/,
];

describe('public code never touches tier proposals', () => {
  it('checks the public pages, API routes, components and serializers', () => {
    assert.ok(publicFiles.some((file) => file.endsWith(`pages${path.sep}index.astro`)));
    assert.ok(
      publicFiles.some(
        (file) => file.endsWith(`suggestions.ts`) && file.includes(`${path.sep}api${path.sep}`)
      )
    );
  });

  for (const file of publicFiles) {
    it(path.relative(ROOT, file), () => {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) assert.doesNotMatch(source, pattern);
    });
  }
});

describe('public code never touches visits or field notes', () => {
  it('checks the dossier components that are not themselves the Visits section', () => {
    assert.ok(publicFiles.some((file) => file.endsWith('ConcordCard.vue')));
    assert.ok(!publicFiles.some((file) => file.endsWith('VenueVisits.vue')));
  });

  for (const file of publicFiles) {
    it(path.relative(ROOT, file), () => {
      const source = readFileSync(file, 'utf8');
      for (const pattern of VISIT_FORBIDDEN) assert.doesNotMatch(source, pattern);
    });
  }

  it('the public venue serializer outputs only public fields', () => {
    const row = {
      id: 'uuid',
      slug: 'chip-shop',
      name: 'Chip Shop',
      tier: 'approved',
      address: '1 High St',
      latitude: '53.48',
      longitude: '-2.25',
      pullQuote: null,
      lunchSpecial: 'Chips',
      websiteUrl: null,
      cost: '££',
      cuisine: 'fish_and_chips',
      distanceMiles: '0.40',
      walkingTimeMin: 9,
      routeUpdatedAt: null,
      lastInspectionDate: '2026-09-01',
      mapSearchLink: null,
      closedAt: null,
      closedBy: 'admin-1',
      createdAt: new Date(),
      updatedAt: new Date(),
      updatedBy: 'admin-1',
    } as unknown as VenueRow & { tier: 'approved' };
    assert.deepEqual(Object.keys(toPublicVenue(row)).sort(), [
      'address',
      'closed',
      'cost',
      'cuisine',
      'distanceMiles',
      'eatLikeUs',
      'id',
      'image',
      'lastInspectionDate',
      'lat',
      'lng',
      'mapSearchLink',
      'name',
      'slug',
      'tier',
      'walkingTimeMin',
    ]);
  });
});

/**
 * People's Inspections (#137): the public feed (the venue page island and its endpoint) never
 * reads or shows a member's id, email or position, or the Chairs' review notes.
 */
describe('the Swing-o-meter leaks nothing about members', () => {
  // "position" is the People's score on the 0 to 100 line here, not anyone's location.
  const swingFiles = [
    path.join(ROOT, 'components/islands/SwingOMeter.vue'),
    path.join(ROOT, 'pages/api/public/venues/[slug]/swing.ts'),
    path.join(ROOT, 'pages/api/public/the-count.ts'),
    path.join(ROOT, 'pages/the-count.astro'),
    path.join(ROOT, 'lib/swing.ts'),
  ];
  const LEAKS = [/email/i, /memberId/, /member_id/, /latitude|longitude/, /review_?reason/i];

  for (const file of swingFiles) {
    it(path.relative(ROOT, file), () => {
      const source = readFileSync(file, 'utf8');
      for (const pattern of LEAKS) {
        // swing.ts handles member ids while summarising logs, server side, and never returns them.
        if (file.endsWith('lib/swing.ts') && pattern.source === 'memberId') continue;
        assert.doesNotMatch(source, pattern);
      }
    });
  }

  it('the public meter type names no member', () => {
    const source = readFileSync(path.join(ROOT, 'lib/swing.ts'), 'utf8');
    const block = source.slice(source.indexOf('export interface VenueSwing'));
    assert.doesNotMatch(block, /memberId|email/i);
  });
});

describe('the public lunch-log feed leaks nothing about members', () => {
  const feedFiles = [
    path.join(ROOT, 'components/islands/PublicInspections.vue'),
    path.join(ROOT, 'pages/api/venues/[slug]/public-inspections.ts'),
  ];
  const LEAKS = [
    /email/i,
    /memberId/,
    /member_id/,
    /position/,
    /latitude|longitude/,
    /review_?reason/i,
  ];

  for (const file of feedFiles) {
    it(path.relative(ROOT, file), () => {
      const source = readFileSync(file, 'utf8');
      for (const pattern of LEAKS) assert.doesNotMatch(source, pattern);
    });
  }

  it('the public feed type names no identifying or locating field', () => {
    const source = readFileSync(path.join(ROOT, 'lib/member-inspections.ts'), 'utf8');
    const block = source.slice(
      source.indexOf('interface PublicMemberInspection'),
      source.indexOf('export interface PublicInspectionsFeed')
    );
    assert.ok(block.includes('displayName'));
    for (const pattern of LEAKS) assert.doesNotMatch(block, pattern);
  });
});
