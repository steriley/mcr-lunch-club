import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createBaseMarker,
  createClusterIconHtml,
  createClusterMarker,
  createLabelMarker,
  createVenueIconHtml,
  createVenueMarker,
  createWalkingIsochrones,
  escapeHtml,
  venuePinLabel,
} from './markers';
import { BASE_LAT, BASE_LNG, WALKING_ISOCHRONES } from './config';
import { TIERS } from '@/lib/tiers';
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
  it('shows the tier glyph on every pin, and not the price', () => {
    for (const tier of TIERS) {
      const html = createVenueIconHtml(venue({ tier: tier.value }));
      assert.ok(html.includes(`<path d="${tier.glyph}"/>`), `${tier.value} has its glyph`);
    }
    assert.ok(!createVenueIconHtml(venue()).includes('>££<'), 'no price on the pin');
  });

  it('gives every tier a different glyph, so tier reads in greyscale', () => {
    assert.equal(new Set(TIERS.map((tier) => tier.glyph)).size, TIERS.length);
  });

  it('keeps every pin the same 28 px size', () => {
    for (const tier of TIERS) assert.ok(createVenueIconHtml(venue({ tier: tier.value })).includes('w-7 h-7'));
  });

  it('uses the tier colour for the pin', () => {
    assert.ok(createVenueIconHtml(venue({ tier: 'rejected' })).includes('var(--color-tier-rejected)'));
  });

  it('hides the glyph from screen readers, which get the name, tier and price instead', () => {
    const html = createVenueIconHtml(venue());
    assert.ok(html.includes('aria-hidden="true" focusable="false"><path'));
    assert.ok(html.includes('Chip Shop, Approved, ££, 6 min walk'));
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

  it('adds the escaped label for screen readers', () => {
    const html = createVenueIconHtml(venue({ name: 'Fish <&> Chips' }));
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
    assert.ok(circles.slice(0, -1).every((circle) => circle.options.weight === 1 && !circle.options.dashArray));
    assert.ok(circles.at(-1).options.weight > circles[0].options.weight, 'the boundary is heavier');
    assert.ok(circles.at(-1).options.dashArray, 'and dashed');
    assert.equal(new Set(circles.map((circle) => circle.options.color)).size, 1, 'one colour for every ring');
    assert.ok(circles.every((circle) => circle.options.interactive === false));
  });
});

describe('createLabelMarker', () => {
  it('centres an untouchable, unfocusable marker on the point', () => {
    const marker = createLabelMarker(L, [53.48, -2.25], 'Chip Shop · ££', { width: 80, height: 16 }, 'name');
    assert.deepEqual(marker.latlng, [53.48, -2.25]);
    assert.equal(marker.options.interactive, false);
    assert.equal(marker.options.keyboard, false);
    assert.deepEqual(marker.options.icon.divIcon.iconSize, [80, 16]);
    assert.deepEqual(marker.options.icon.divIcon.iconAnchor, [40, 8]);
    assert.ok(marker.options.icon.divIcon.className.includes('ledger-label-name'));
  });

  it('hides its text from screen readers and escapes it', () => {
    const marker = createLabelMarker(L, [0, 0], '<b>Fish & Chips</b>', { width: 80, height: 16 }, 'ring');
    const { html } = marker.options.icon.divIcon;
    assert.ok(html.includes('aria-hidden="true"'));
    assert.ok(html.includes('&lt;b&gt;Fish &amp; Chips&lt;/b&gt;'));
    assert.ok(marker.options.icon.divIcon.className.includes('ledger-label-ring'));
  });
});

describe('the pin name tag', () => {
  it('carries the name and price, hidden from screen readers (the pin already announces them)', () => {
    const html = createVenueIconHtml(venue({ name: "Crazy Pedro's", cost: '££' }));
    assert.ok(html.includes('<span class="ledger-pin-name" aria-hidden="true">Crazy Pedro&#39;s · ££</span>'));
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

describe('cluster markers', () => {
  const cluster = {
    count: 5,
    tiers: [
      { tier: 'approved' as const, count: 3 },
      { tier: 'under_consideration' as const, count: 2 },
    ],
  };

  it('shows the count in a ring with one segment per tier, sized by share', () => {
    const html = createClusterIconHtml(cluster, '5 venues');
    assert.ok(html.includes('>5</span>'));
    assert.equal((html.match(/<circle[^>]*pathLength/g) ?? []).length, 2);
    assert.ok(html.includes('var(--color-tier-approved)') && html.includes('var(--color-tier-under-consideration)'));
    // 3 of 5 is 60 percent, less a hairline gap; it starts at 0, the next picks up at 60.
    assert.ok(html.includes('stroke-dasharray="58.50 41.50" stroke-dashoffset="0.00"'));
    assert.ok(html.includes('stroke-dashoffset="-60.00"'));
  });

  it('draws one unbroken ring for a single tier', () => {
    const html = createClusterIconHtml({ count: 3, tiers: [{ tier: 'rejected', count: 3 }] }, '3 venues');
    assert.ok(html.includes('stroke-dasharray="100.00 0.00"'));
  });

  it('names itself for screen readers and hides the drawing', () => {
    const html = createClusterIconHtml(cluster, '5 venues: 3 Approved, 2 Under Consideration. Zoom in');
    assert.ok(html.includes('<span class="sr-only">5 venues: 3 Approved, 2 Under Consideration. Zoom in</span>'));
    assert.ok(html.includes('aria-hidden="true" focusable="false"'));
  });

  it('escapes the label', () => {
    assert.ok(!createClusterIconHtml(cluster, '<img onerror=x>').includes('<img'));
  });

  it('is a 44 px marker centred on the cluster', () => {
    const marker = createClusterMarker(L, { ...cluster, kind: 'cluster', key: 'a|b', lat: 53.48, lng: -2.25, venues: [], expansionZoom: 16 }, 'label');
    assert.deepEqual(marker.latlng, [53.48, -2.25]);
    assert.deepEqual(marker.options.icon.divIcon.iconSize, [44, 44]);
    assert.deepEqual(marker.options.icon.divIcon.iconAnchor, [22, 22]);
  });
});
