import '../test/setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  countPublicInspections,
  countPublicVenues,
  getGoldenCut,
  getMapVenues,
  getPublicInspections,
  getPublicVenue,
  getPublicVenueDetails,
  getPublicVenues,
  getPublishedIncidents,
  formatIncidentDate,
  serializeForScript,
  toPublicIncident,
  toPublicImage,
  toPublicInspection,
  toPublicVenue,
} from './public-data';
import type { BriberyRow, InspectionRow, VenueImageRow, VenueRow } from '@/db/schema';
import { publicVenueCondition } from './visibility-sql';
import { renderSql, restoreStubs, stubDb } from '../test/route-helpers';

afterEach(restoreStubs);

function venueRow(
  overrides: Partial<VenueRow> = {}
): VenueRow & { tier: NonNullable<VenueRow['tier']> } {
  return {
    id: 'uuid',
    slug: 'chip-shop',
    name: 'Chip Shop',
    tier: 'approved',
    address: '1 High St',
    latitude: '53.480000',
    longitude: '-2.250000',
    pullQuote: null,
    lunchSpecial: 'Chips',
    websiteUrl: 'https://chips.example',
    cost: '££',
    cuisine: 'fish_and_chips',
    distanceMiles: '0.40',
    walkingTimeMin: 9,
    lastInspectionDate: '2026-09-01',
    mapSearchLink: 'https://maps.example/chips',
    closedAt: null,
    closedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: null,
    ...overrides,
  } as VenueRow & { tier: NonNullable<VenueRow['tier']> };
}

function imageRow(overrides: Partial<VenueImageRow> = {}): VenueImageRow {
  return {
    id: 'img-1',
    venueId: 'uuid',
    fullUrl: 'https://store.public.blob.vercel-storage.com/prod/venues/uuid/img-1-full.webp',
    thumbUrl: 'https://store.public.blob.vercel-storage.com/prod/venues/uuid/img-1-thumb.webp',
    width: 1600,
    height: 1067,
    caption: null,
    isPrimary: true,
    focalX: null,
    focalY: null,
    uploadedBy: 'admin-1',
    createdAt: new Date(),
    ...overrides,
  };
}

/** A row as the public venue queries return it: the venue and its primary photo, if any. */
const joined = (venue: VenueRow, image: VenueImageRow | null = null) => ({ venue, image });

function briberyRow(overrides: Partial<BriberyRow> = {}): BriberyRow {
  return {
    id: 'b1',
    venueId: null,
    venueNameText: null,
    title: 'Free cookie',
    incidentDate: '2026-07-08',
    incidentTime: '09:00',
    location: 'The till',
    peopleInvolved: ['Ann'],
    witnesses: ['Bob'],
    benefitOffered: 'A cookie',
    value: '£2',
    description: 'A cookie was offered.',
    outcome: 'Declined',
    published: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as BriberyRow;
}

describe('toPublicVenue', () => {
  it('maps a fully populated row', () => {
    const venue = toPublicVenue(venueRow());
    assert.equal(venue.id, 'chip-shop');
    assert.equal(venue.tier, 'approved');
    assert.equal(venue.lat, 53.48);
    assert.equal(venue.distanceMiles, 0.4);
    assert.equal(venue.walkingTimeMin, 9);
    assert.equal(venue.eatLikeUs, 'Chips');
    assert.equal(venue.cuisine, 'Fish & Chips');
    assert.equal(venue.mapSearchLink, 'https://maps.example/chips');
    for (const removed of ['rank', 'notes', 'evidenceUrl', 'rejectionReason', 'verdict']) {
      assert.ok(!(removed in venue), removed);
    }
  });

  it('fills defaults for sparse rows and leaves a pending route as null', () => {
    const venue = toPublicVenue(
      venueRow({
        latitude: null,
        longitude: null,
        distanceMiles: null,
        walkingTimeMin: null,
        mapSearchLink: null,
        cuisine: 'other',
        lunchSpecial: null,
        address: null,
        websiteUrl: null,
        lastInspectionDate: null,
        tier: 'under_consideration',
      })
    );
    assert.equal(venue.tier, 'under_consideration');
    assert.equal(venue.lat, null);
    assert.equal(venue.distanceMiles, null);
    assert.equal(venue.walkingTimeMin, null);
    assert.equal(venue.cuisine, 'Other');
    assert.equal(venue.lastInspectionDate, 'Awaiting Assessment');
    assert.equal(
      venue.mapSearchLink,
      'https://www.google.com/maps/search/?api=1&query=Chip%20Shop%20Manchester'
    );
  });

  it('never estimates distance or walking time, but links to the coordinates', () => {
    const venue = toPublicVenue(
      venueRow({ distanceMiles: null, walkingTimeMin: null, mapSearchLink: null })
    );
    assert.equal(venue.distanceMiles, null);
    assert.equal(venue.walkingTimeMin, null);
    assert.equal(
      venue.mapSearchLink,
      'https://www.google.com/maps/search/?api=1&query=53.480000%2C-2.250000'
    );
  });
});

describe('toPublicImage', () => {
  it('has no image when the venue has no primary photo', () => {
    assert.equal(toPublicImage(null, 'Chip Shop'), null);
    assert.equal(toPublicVenue(venueRow()).image, null);
  });

  it('exposes the URLs, size, alt text and focal point, and nothing else', () => {
    const image = toPublicImage(
      imageRow({ caption: '  Top-down pizza ', focalX: 30, focalY: 70 }),
      'Chip Shop'
    );
    assert.deepEqual(image, {
      url: imageRow().fullUrl,
      thumbUrl: imageRow().thumbUrl,
      width: 1600,
      height: 1067,
      alt: 'Top-down pizza',
      focalX: 30,
      focalY: 70,
    });
  });

  it('falls back to the full image for a migrated photo and to the venue name for alt text', () => {
    const image = toPublicImage(
      imageRow({
        fullUrl: 'https://example.com/old.jpg',
        thumbUrl: null,
        width: null,
        height: null,
        caption: '  ',
      }),
      'Chip Shop'
    );
    assert.deepEqual(
      [image?.thumbUrl, image?.width, image?.alt],
      ['https://example.com/old.jpg', null, 'Chip Shop']
    );
  });
});

describe('formatIncidentDate', () => {
  it('returns undefined without a date', () => {
    assert.equal(formatIncidentDate(null, '09:00'), undefined);
  });

  it('formats the date as "8th Jul 26"', () => {
    assert.equal(formatIncidentDate('2026-07-08', null), '8th Jul 26');
    assert.equal(formatIncidentDate('2026-09-21', null), '21st Sept 26');
  });

  it('adds the recorded 24-hour time without converting it', () => {
    assert.equal(formatIncidentDate('2026-07-08', '09:00'), '8th Jul 26, 09:00');
    assert.equal(formatIncidentDate('2026-07-08', '12:30:00'), '8th Jul 26, 12:30');
    assert.equal(formatIncidentDate('2026-07-08', '00:05'), '8th Jul 26, 00:05');
    assert.equal(formatIncidentDate('2026-07-08', '23:00'), '8th Jul 26, 23:00');
  });
});

describe('toPublicIncident', () => {
  it('maps a full record', () => {
    const incident = toPublicIncident(briberyRow());
    assert.equal(incident.date, '2026-07-08');
    assert.equal(incident.time, '09:00');
    assert.equal(incident.formattedDate, '8th Jul 26, 09:00');
    assert.equal(incident.location, 'The till');
    assert.equal(incident.context, 'A cookie was offered.');
    assert.deepEqual(incident.peopleInvolved, ['Ann']);
  });

  it('omits optional fields and falls back to the venue name for location', () => {
    const incident = toPublicIncident(
      briberyRow({
        incidentDate: null,
        incidentTime: null,
        location: null,
        venueNameText: 'Chip Shop',
        title: null as any,
        benefitOffered: null,
        value: null,
        outcome: null,
      })
    );
    assert.equal(incident.date, '');
    assert.ok(!('time' in incident));
    assert.ok(!('formattedDate' in incident));
    assert.equal(incident.location, 'Chip Shop');
    assert.equal(incident.title, 'Improper benefit attempt');
    assert.equal(incident.benefitOffered, '');
    assert.equal(incident.value, '');
    assert.equal(incident.outcome, '');
  });

  it('has no location when neither location nor venue name is set', () => {
    assert.ok(
      !('location' in toPublicIncident(briberyRow({ location: null, venueNameText: null })))
    );
  });
});

describe('serializeForScript', () => {
  it('escapes sequences that could end a script tag or break a JS string', () => {
    const text = serializeForScript({ a: '</script><b>', b: '  ' });
    assert.ok(!text.includes('<'));
    assert.ok(!text.includes(' '));
    assert.ok(!text.includes(' '));
    assert.deepEqual(JSON.parse(text), { a: '</script><b>', b: '  ' });
  });
});

describe('public venue queries', () => {
  it('getPublicVenues filters with the shared visibility rule', async () => {
    const calls = stubDb('select', []);
    await getPublicVenues();
    const { sql } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.equal(sql, renderSql(publicVenueCondition()).sql);
  });

  it("getPublicVenues groups by tier and applies each tier's order", async () => {
    stubDb('select', [
      joined(venueRow({ slug: 'z-reject', name: 'Zed', tier: 'rejected', walkingTimeMin: 1 })),
      joined(venueRow({ slug: 'far', name: 'Far', walkingTimeMin: 20 })),
      joined(venueRow({ slug: 'a-reject', name: 'Abel', tier: 'rejected', walkingTimeMin: 30 })),
      joined(venueRow({ slug: 'near', name: 'Near', walkingTimeMin: 5 })),
    ]);
    const venues = await getPublicVenues();
    assert.deepEqual(
      venues.map((venue) => venue.slug),
      ['near', 'far', 'a-reject', 'z-reject']
    );
    assert.equal(venues[2].tier, 'rejected');
  });

  it('getMapVenues leaves closed venues off the map, even Gone But Not Forgotten ones', async () => {
    const closedAt = new Date('2026-10-01T00:00:00Z');
    stubDb('select', [
      joined(venueRow({ slug: 'open' })),
      joined(venueRow({ slug: 'closed-gone', tier: 'gone_but_not_forgotten', closedAt })),
      joined(venueRow({ slug: 'open-gone', tier: 'gone_but_not_forgotten' })),
    ]);
    assert.deepEqual(
      (await getMapVenues()).map((venue) => venue.slug),
      ['open', 'open-gone']
    );
  });

  it('flags closed venues for the public pages', async () => {
    stubDb('select', [
      joined(
        venueRow({ slug: 'closed-gone', tier: 'gone_but_not_forgotten', closedAt: new Date() })
      ),
    ]);
    const [venue] = await getPublicVenues();
    assert.equal(venue.closed, true);
    assert.equal(venue.tier, 'gone_but_not_forgotten');
  });

  it('getPublicVenue checks visibility and returns the detail fields, or null when hidden or missing', async () => {
    const calls = stubDb('select', [
      joined(venueRow({ pullQuote: 'Gold' }), imageRow({ caption: 'The counter' })),
    ]);
    const venue = await getPublicVenue('chip-shop');
    assert.match(
      renderSql(calls.find((call) => call.method === 'where')!.args[0]).sql,
      /"tier" is not null/
    );
    assert.equal(venue?.pullQuote, 'Gold');
    assert.equal(venue?.image?.url, imageRow().fullUrl);
    assert.equal(venue?.image?.alt, 'The counter');
    assert.equal(venue?.slug, 'chip-shop');

    stubDb('select', []);
    assert.equal(await getPublicVenue('missing'), null);
  });

  it('getPublicVenueDetails returns every visible venue with its detail fields', async () => {
    const calls = stubDb('select', [
      joined(venueRow({ slug: 'chip-shop', pullQuote: 'Gold' }), imageRow()),
      joined(venueRow({ slug: 'pending', tier: null as never })),
    ]);
    const venues = await getPublicVenueDetails();
    assert.equal(
      renderSql(calls.find((call) => call.method === 'where')!.args[0]).sql,
      renderSql(publicVenueCondition()).sql
    );
    assert.deepEqual(
      venues.map((venue) => [venue.slug, venue.pullQuote]),
      [['chip-shop', 'Gold']]
    );
    assert.equal(venues[0].websiteUrl, 'https://chips.example');
    assert.equal(venues[0].image?.url, imageRow().fullUrl);
  });

  it('joins only the primary photo, inside the visibility filter', async () => {
    const calls = stubDb('select', []);
    await getPublicVenues();
    const join = calls.find((call) => call.method === 'leftJoin')!;
    assert.match(
      renderSql(join.args[1]).sql,
      /"venue_images"\."venue_id" = "venues"\."id" and "venue_images"\."is_primary" = \$1/
    );
    assert.deepEqual(renderSql(join.args[1]).params, [true]);
    assert.equal(
      renderSql(calls.find((call) => call.method === 'where')!.args[0]).sql,
      renderSql(publicVenueCondition()).sql
    );
  });

  it('a venue that is not publicly visible exposes no image anywhere', async () => {
    const photo = imageRow();
    const hidden = [
      joined(venueRow({ slug: 'pending', tier: null as never }), photo),
      joined(venueRow({ slug: 'unlocated', latitude: null, longitude: null }), photo),
    ];
    for (const load of [getPublicVenues, getMapVenues, getPublicVenueDetails]) {
      stubDb('select', hidden);
      const venues = await load();
      assert.deepEqual(venues, [], load.name);
    }
    stubDb('select', [hidden[0]]);
    assert.equal(await getPublicVenue('pending'), null);
    stubDb('select', [
      { entry: { venueId: 'uuid', position: 1, puffPiece: null, anchorDish: null }, ...hidden[0] },
    ]);
    assert.deepEqual(await getGoldenCut(), []);
  });

  it('carries the primary photo onto public venues and The Golden Cut', async () => {
    stubDb('select', [
      joined(venueRow({ slug: 'with-photo' }), imageRow()),
      joined(venueRow({ slug: 'without', name: 'Bare' })),
    ]);
    const venues = await getMapVenues();
    const bySlug = new Map(venues.map((venue) => [venue.slug, venue.image?.thumbUrl ?? null]));
    assert.deepEqual(Object.fromEntries(bySlug), {
      'with-photo': imageRow().thumbUrl,
      without: null,
    });

    stubDb('select', [
      {
        entry: { venueId: 'uuid', position: 1, puffPiece: null, anchorDish: null },
        venue: venueRow(),
        image: imageRow({ focalX: 10, focalY: 90 }),
      },
    ]);
    const [hero] = await getGoldenCut();
    assert.deepEqual(
      [hero.venue.image?.url, hero.venue.image?.focalX, hero.venue.image?.focalY],
      [imageRow().fullUrl, 10, 90]
    );
  });

  it('getPublishedIncidents maps every returned record', async () => {
    stubDb('select', [briberyRow(), briberyRow({ id: 'b2', incidentDate: null })]);
    const incidents = await getPublishedIncidents();
    assert.deepEqual(
      incidents.map((incident) => incident.id),
      ['b1', 'b2']
    );
    assert.equal(incidents[1].date, '');
  });
});

function inspectionRow(overrides: Partial<InspectionRow> = {}): InspectionRow {
  return {
    id: 'i1',
    venueId: 'uuid',
    inspectionDate: '2026-10-01',
    status: 'confirmed',
    kind: 'verified',
    outcome: 'satisfactory',
    firstAdminId: 'a1',
    firstAdminName: 'Sam',
    secondAdminId: 'a2',
    secondAdminName: 'Alex',
    createdAt: new Date(),
    confirmedAt: new Date(),
    ...overrides,
  } as InspectionRow;
}

describe('toPublicInspection', () => {
  it('shows the venue, the date and both Chairs of a verified inspection', () => {
    assert.deepEqual(toPublicInspection(inspectionRow(), venueRow()), {
      id: 'i1',
      venueSlug: 'chip-shop',
      venueName: 'Chip Shop',
      date: '2026-10-01',
      kind: 'verified',
      outcome: 'satisfactory',
      chairs: ['Sam', 'Alex'],
    });
  });

  it('shows a below-par outcome, and none for a legacy record', () => {
    assert.equal(
      toPublicInspection(inspectionRow({ outcome: 'below_par' }), venueRow()).outcome,
      'below_par'
    );
    assert.equal(
      toPublicInspection(inspectionRow({ kind: 'legacy', outcome: null }), venueRow()).outcome,
      null
    );
  });

  it('copes with deleted Chairs and names nobody on a legacy record', () => {
    assert.deepEqual(
      toPublicInspection(inspectionRow({ firstAdminName: null, secondAdminName: null }), venueRow())
        .chairs,
      ['Former Chair', 'Former Chair']
    );
    assert.deepEqual(
      toPublicInspection(
        inspectionRow({ kind: 'legacy', firstAdminName: null, secondAdminName: null }),
        venueRow()
      ).chairs,
      []
    );
  });

  it('never exposes admin ids', () => {
    const inspection = toPublicInspection(inspectionRow(), venueRow());
    for (const key of ['firstAdminId', 'secondAdminId', 'venueId', 'status'])
      assert.ok(!(key in inspection), key);
  });
});

describe('public inspection queries', () => {
  it('only reads confirmed inspections of public venues', async () => {
    const calls = stubDb('select', []);
    await getPublicInspections();
    const { sql, params } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /"inspections"\."status" = \$1/);
    assert.equal(params[0], 'confirmed');
    assert.ok(
      sql.includes(
        renderSql(publicVenueCondition()).sql.replace(/\$\d+/g, (n) => `$${Number(n.slice(1)) + 1}`)
      )
    );
  });

  it('filters by venue when given a slug', async () => {
    const calls = stubDb('select', []);
    await getPublicInspections('chip-shop');
    const { sql, params } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /"venues"\."slug" = /);
    assert.ok(params.includes('chip-shop'));
  });

  it('maps rows and drops any venue that fails the visibility rule', async () => {
    stubDb('select', [
      { inspection: inspectionRow(), venue: venueRow() },
      {
        inspection: inspectionRow({ id: 'hidden' }),
        venue: venueRow({ slug: 'closed', closedAt: new Date() }),
      },
    ]);
    assert.deepEqual(
      (await getPublicInspections()).map((inspection) => inspection.id),
      ['i1']
    );
  });

  it('counts public inspections, with 0 for an empty result', async () => {
    stubDb('select', [{ total: 7 }]);
    assert.equal(await countPublicInspections(), 7);
    stubDb('select', []);
    assert.equal(await countPublicInspections(), 0);
  });
});

describe('countPublicVenues', () => {
  it('counts venues under the public visibility rule, with 0 for an empty result', async () => {
    const calls = stubDb('select', [{ total: 90 }]);
    assert.equal(await countPublicVenues(), 90);
    const { sql } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.equal(sql, renderSql(publicVenueCondition()).sql);
    stubDb('select', []);
    assert.equal(await countPublicVenues(), 0);
  });
});

describe('getGoldenCut', () => {
  const entry = (venueId: string, position: number, overrides = {}) => ({
    venueId,
    position,
    puffPiece: null,
    anchorDish: null,
    ...overrides,
  });

  it('reads Approved public venues in position order', async () => {
    const calls = stubDb('select', []);
    await getGoldenCut();
    const { sql, params } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.match(sql, /"tier" is not null/);
    assert.ok(params.includes('approved'));
    assert.ok(calls.some((call) => call.method === 'orderBy'));
  });

  it('skips venues that left Approved or closed, so the next one moves up', async () => {
    stubDb('select', [
      {
        entry: entry('a', 1),
        venue: venueRow({ slug: 'closed', tier: 'approved', closedAt: new Date() }),
        image: null,
      },
      {
        entry: entry('b', 2),
        venue: venueRow({ slug: 'demoted', tier: 'if_we_must' }),
        image: null,
      },
      { entry: entry('c', 3), venue: venueRow({ slug: 'open' }), image: null },
    ]);
    assert.deepEqual(
      (await getGoldenCut()).map((item) => item.venue.slug),
      ['open']
    );
  });

  it("uses the Chairs' text, falling back to the pull quote and lunch special", async () => {
    stubDb('select', [
      {
        entry: entry('a', 1, { puffPiece: 'The best.', anchorDish: 'Pizza' }),
        venue: venueRow({ slug: 'written' }),
        image: null,
      },
      {
        entry: entry('b', 2),
        venue: venueRow({ slug: 'fallback', pullQuote: 'Gold', lunchSpecial: 'Chips' }),
        image: null,
      },
      {
        entry: entry('c', 3),
        venue: venueRow({ slug: 'bare', pullQuote: null, lunchSpecial: null }),
        image: null,
      },
    ]);
    assert.deepEqual(
      (await getGoldenCut()).map(({ puffPiece, anchorDish }) => [puffPiece, anchorDish]),
      [
        ['The best.', 'Pizza'],
        ['Gold', 'Chips'],
        [null, null],
      ]
    );
  });
});
