import '../test/setup-env';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_CACHE_CONTROL,
  getPublicVenue,
  getPublicVenues,
  getPublishedIncidents,
  formatIncidentDate,
  serializeForScript,
  setPublicCacheHeaders,
  toPublicIncident,
  toPublicVenue,
} from './public-data';
import type { BriberyRow, VenueRow } from '@/db/schema';
import { publicVenueCondition } from './visibility';
import { renderSql, restoreStubs, stubDb } from '../test/route-helpers';

afterEach(restoreStubs);

function venueRow(overrides: Partial<VenueRow> = {}): VenueRow & { tier: NonNullable<VenueRow['tier']> } {
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
    imageUrl: null,
    cost: '££',
    cuisine: 'British',
    distanceMiles: '0.40',
    walkingTimeMin: 9,
    lastInspectionDate: '2026-09-01',
    mapSearchLink: 'https://maps.example/chips',
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: null,
    ...overrides,
  } as VenueRow & { tier: NonNullable<VenueRow['tier']> };
}

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
    assert.equal(venue.status, 'Approved');
    assert.equal(venue.lat, 53.48);
    assert.equal(venue.distanceMiles, 0.4);
    assert.equal(venue.walkingTimeMin, 9);
    assert.equal(venue.eatLikeUs, 'Chips');
    assert.equal(venue.mapSearchLink, 'https://maps.example/chips');
    for (const removed of ['rank', 'notes', 'evidenceUrl', 'rejectionReason', 'verdict']) {
      assert.ok(!(removed in venue), removed);
    }
  });

  it('fills defaults for sparse rows without coordinates', () => {
    const venue = toPublicVenue(
      venueRow({
        latitude: null,
        longitude: null,
        distanceMiles: null,
        walkingTimeMin: null,
        mapSearchLink: null,
        cuisine: null,
        lunchSpecial: null,
        address: null,
        websiteUrl: null,
        lastInspectionDate: null,
        tier: 'under_consideration',
      })
    );
    assert.equal(venue.status, 'Under Consideration');
    assert.equal(venue.lat, null);
    assert.equal(venue.distanceMiles, 0);
    assert.equal(venue.walkingTimeMin, 1);
    assert.equal(venue.cuisine, '');
    assert.equal(venue.lastInspectionDate, 'Awaiting Assessment');
    assert.equal(venue.mapSearchLink, 'https://www.google.com/maps/search/?api=1&query=Chip%20Shop%20Manchester');
  });

  it('derives distance, walk time and map link from coordinates when missing', () => {
    const venue = toPublicVenue(venueRow({ distanceMiles: null, walkingTimeMin: null, mapSearchLink: null }));
    assert.ok(venue.distanceMiles > 0);
    assert.ok(venue.walkingTimeMin >= 1);
    assert.equal(venue.mapSearchLink, 'https://www.google.com/maps/search/?api=1&query=53.480000%2C-2.250000');
  });
});

describe('formatIncidentDate', () => {
  it('returns undefined without a date', () => {
    assert.equal(formatIncidentDate(null, '09:00'), undefined);
  });

  it('formats ordinals', () => {
    const format = (day: number) => formatIncidentDate(`2026-07-${String(day).padStart(2, '0')}`, null);
    assert.equal(format(1), '1st July 2026');
    assert.equal(format(2), '2nd July 2026');
    assert.equal(format(3), '3rd July 2026');
    assert.equal(format(4), '4th July 2026');
    assert.equal(format(11), '11th July 2026');
    assert.equal(format(12), '12th July 2026');
    assert.equal(format(13), '13th July 2026');
    assert.equal(format(21), '21st July 2026');
    assert.equal(format(22), '22nd July 2026');
  });

  it('formats 12-hour times', () => {
    assert.equal(formatIncidentDate('2026-07-08', '09:00'), '8th July 2026 at 9am');
    assert.equal(formatIncidentDate('2026-07-08', '12:30'), '8th July 2026 at 12:30pm');
    assert.equal(formatIncidentDate('2026-07-08', '00:05'), '8th July 2026 at 12:05am');
    assert.equal(formatIncidentDate('2026-07-08', '23:00'), '8th July 2026 at 11pm');
  });
});

describe('toPublicIncident', () => {
  it('maps a full record', () => {
    const incident = toPublicIncident(briberyRow());
    assert.equal(incident.date, '2026-07-08');
    assert.equal(incident.time, '09:00');
    assert.equal(incident.formattedDate, '8th July 2026 at 9am');
    assert.equal(incident.location, 'The till');
    assert.equal(incident.context, 'A cookie was offered.');
    assert.deepEqual(incident.peopleInvolved, ['Ann']);
  });

  it('omits optional fields and falls back to the venue name for location', () => {
    const incident = toPublicIncident(
      briberyRow({ incidentDate: null, incidentTime: null, location: null, venueNameText: 'Chip Shop', title: null as any, benefitOffered: null, value: null, outcome: null })
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
    assert.ok(!('location' in toPublicIncident(briberyRow({ location: null, venueNameText: null }))));
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

describe('setPublicCacheHeaders', () => {
  it('sets the CDN cache header', () => {
    const headers = new Headers();
    setPublicCacheHeaders(headers);
    assert.equal(headers.get('Cache-Control'), PUBLIC_CACHE_CONTROL);
  });
});

describe('public venue queries', () => {
  it('getPublicVenues filters with the shared visibility rule', async () => {
    const calls = stubDb('select', []);
    await getPublicVenues();
    const { sql } = renderSql(calls.find((call) => call.method === 'where')!.args[0]);
    assert.equal(sql, renderSql(publicVenueCondition()).sql);
  });

  it('getPublicVenues groups by tier and applies each tier\'s order', async () => {
    stubDb('select', [
      venueRow({ slug: 'z-reject', name: 'Zed', tier: 'rejected', walkingTimeMin: 1 }),
      venueRow({ slug: 'far', name: 'Far', walkingTimeMin: 20 }),
      venueRow({ slug: 'a-reject', name: 'Abel', tier: 'rejected', walkingTimeMin: 30 }),
      venueRow({ slug: 'near', name: 'Near', walkingTimeMin: 5 }),
    ]);
    const venues = await getPublicVenues();
    assert.deepEqual(venues.map((venue) => venue.slug), ['near', 'far', 'a-reject', 'z-reject']);
    assert.equal(venues[2].status, 'Rejected');
  });

  it('getPublicVenue checks visibility and returns the detail fields, or null when hidden or missing', async () => {
    const calls = stubDb('select', [venueRow({ pullQuote: 'Gold', imageUrl: 'https://img.example/a.jpg' })]);
    const venue = await getPublicVenue('chip-shop');
    assert.match(renderSql(calls.find((call) => call.method === 'where')!.args[0]).sql, /"tier" is not null/);
    assert.equal(venue?.pullQuote, 'Gold');
    assert.equal(venue?.imageUrl, 'https://img.example/a.jpg');
    assert.equal(venue?.slug, 'chip-shop');

    stubDb('select', []);
    assert.equal(await getPublicVenue('missing'), null);
  });

  it('getPublishedIncidents maps every returned record', async () => {
    stubDb('select', [briberyRow(), briberyRow({ id: 'b2', incidentDate: null })]);
    const incidents = await getPublishedIncidents();
    assert.deepEqual(incidents.map((incident) => incident.id), ['b1', 'b2']);
    assert.equal(incidents[1].date, '');
  });
});
