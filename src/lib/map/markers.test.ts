import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBaseMarker,
  createVenueIconHtml,
  createVenueMarker,
  createVenuePopupContent,
  createWalkingIsochrones,
} from './markers';
import { BASE_LAT, BASE_LNG, WALKING_ISOCHRONES } from './config';
import type { Venue } from '@/types';

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 'v',
    name: 'Chip Shop',
    slug: 'chip-shop',
    status: 'Approved',
    rank: 3,
    lat: 53.48,
    lng: -2.25,
    distanceMiles: 0.3,
    walkingTimeMin: 6,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: 'Large chips',
    lastInspectionDate: '2026-09-01',
    address: 'Manchester',
    mapSearchLink: '',
    ...overrides,
  };
}

const L = {
  divIcon: (options: any) => ({ divIcon: options }),
  marker: (latlng: number[], options: any) => {
    const marker: any = { latlng, options };
    marker.bindTooltip = (html: string, tooltipOptions: any) => {
      marker.tooltip = { html, tooltipOptions };
      return marker;
    };
    return marker;
  },
  circle: (latlng: number[], options: any) => ({ latlng, options }),
};

describe('createVenueIconHtml', () => {
  it('shows the rank for approved venues', () => {
    assert.ok(createVenueIconHtml(venue()).includes('<span>#3</span>'));
  });

  it('falls back to the cost band when unranked or not approved', () => {
    assert.ok(createVenueIconHtml(venue({ rank: null })).includes('<span>££</span>'));
    assert.ok(createVenueIconHtml(venue({ status: 'Rejected' })).includes('<span>££</span>'));
  });

  it('uses the tier colour for the pin', () => {
    assert.ok(createVenueIconHtml(venue({ status: 'Rejected' })).includes('#B92B27'));
  });
});

describe('createVenueMarker', () => {
  it('returns null without coordinates', () => {
    assert.equal(createVenueMarker(L, venue({ lat: null })), null);
    assert.equal(createVenueMarker(L, venue({ lng: null })), null);
  });

  it('places the marker at the venue coordinates', () => {
    const marker = createVenueMarker(L, venue());
    assert.deepEqual(marker.latlng, [53.48, -2.25]);
    assert.equal(marker.options.icon.divIcon.className, 'custom-ledger-pin');
  });
});

describe('createBaseMarker', () => {
  it('sits at the base with a tooltip', () => {
    const marker = createBaseMarker(L);
    assert.deepEqual(marker.latlng, [BASE_LAT, BASE_LNG]);
    assert.equal(marker.options.zIndexOffset, 1000);
    assert.ok(marker.tooltip.html.includes('Chairs'));
  });
});

describe('createWalkingIsochrones', () => {
  it('creates one non-interactive circle per ring, defaulting the weight', () => {
    const circles = createWalkingIsochrones(L);
    assert.equal(circles.length, WALKING_ISOCHRONES.length);
    assert.equal(circles[0].options.weight, 1.4);
    assert.equal(circles.at(-1).options.weight, 2.5);
    assert.ok(circles.every((circle) => circle.options.interactive === false));
  });
});

describe('createVenuePopupContent', () => {
  afterEach(() => {
    delete (globalThis as any).document;
  });

  it('renders venue details into a div', () => {
    const element: any = {};
    (globalThis as any).document = { createElement: () => element };
    const result = createVenuePopupContent(venue());
    assert.equal(result, element);
    assert.ok(element.innerHTML.includes('Chip Shop'));
    assert.ok(element.innerHTML.includes('6 min walk (0.3 mi)'));
    assert.ok(element.innerHTML.includes('id="btn-inspect-chip-shop"'));
  });
});
