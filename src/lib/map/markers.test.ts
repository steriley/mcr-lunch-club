import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBaseMarker,
  createVenueIconHtml,
  createVenueMarker,
  createWalkingIsochrones,
  escapeHtml,
  venuePinLabel,
} from './markers';
import { BASE_LAT, BASE_LNG, WALKING_ISOCHRONES } from './config';
import type { Venue } from '@/types';

function venue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: 'v',
    name: 'Chip Shop',
    slug: 'chip-shop',
    tier: 'approved',
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
  it('shows the cost band on every pin', () => {
    assert.ok(createVenueIconHtml(venue()).includes('<span aria-hidden="true">££</span>'));
    assert.ok(createVenueIconHtml(venue({ tier: 'rejected' })).includes('<span aria-hidden="true">££</span>'));
  });

  it('uses the tier colour for the pin', () => {
    assert.ok(createVenueIconHtml(venue({ tier: 'rejected' })).includes('var(--color-tier-rejected)'));
  });

  it('escapes the badge text', () => {
    const html = createVenueIconHtml(venue({ tier: 'to_be_assessed', cost: '<b>£</b>' as Venue['cost'] }));
    assert.ok(html.includes('&lt;b&gt;£&lt;/b&gt;'));
    assert.ok(!html.includes('<b>'));
  });
});

describe('createVenueIconHtml rank badge', () => {
  it('adds a numbered badge only when a rank is given', () => {
    assert.ok(createVenueIconHtml(venue(), 3).includes('>3</span>'));
    assert.ok(!createVenueIconHtml(venue()).includes('-top-2 -right-2'));
  });
});

describe('venue pin accessible name', () => {
  it('names the venue, tier, cost and walk instead of announcing only the cost', () => {
    assert.equal(venuePinLabel(venue()), 'Chip Shop, Approved, ££, 6 min walk');
    assert.equal(venuePinLabel(venue({ walkingTimeMin: null })), 'Chip Shop, Approved, ££');
  });

  it('hides the cost badge from screen readers and adds the escaped label', () => {
    const html = createVenueIconHtml(venue({ name: 'Fish <&> Chips' }));
    assert.ok(html.includes('<span aria-hidden="true">££</span>'));
    assert.ok(html.includes('<span class="sr-only">Fish &lt;&amp;&gt; Chips, Approved, ££, 6 min walk</span>'));
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

describe('escapeHtml', () => {
  it('neutralises markup and quotes', () => {
    assert.equal(
      escapeHtml(`<img src=x onerror="alert('hi')">&`),
      '&lt;img src=x onerror=&quot;alert(&#39;hi&#39;)&quot;&gt;&amp;'
    );
  });

  it('renders null and undefined as empty text', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });
});
