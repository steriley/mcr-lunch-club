import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindVenuePopup,
  createBaseMarker,
  createVenueIconHtml,
  createVenueMarker,
  createVenuePopupContent,
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
    assert.ok(createVenueIconHtml(venue({ tier: 'rejected' })).includes('#B92B27'));
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
    assert.ok(element.innerHTML.includes('6 min walk from Base (0.30 mi)'));
    assert.ok(element.innerHTML.includes('data-view-dossier'));
  });

  it('shows the thumbnail with the focal crop and alt text, and no image area without a photo', () => {
    const element: any = {};
    (globalThis as any).document = { createElement: () => element };
    createVenuePopupContent(venue());
    assert.ok(!element.innerHTML.includes('<img'));

    createVenuePopupContent(
      venue({ image: { url: 'https://x.example/full.webp', thumbUrl: 'https://x.example/thumb.webp', width: 1600, height: 1067, alt: 'Chips "large"', focalX: 20, focalY: 80 } })
    );
    assert.match(element.innerHTML, /<img src="https:\/\/x\.example\/thumb\.webp" alt="Chips &quot;large&quot;"/);
    assert.match(element.innerHTML, /object-position: 20% 80%/);
    assert.match(element.innerHTML, /loading="lazy" decoding="async"/);
  });

  it('escapes venue fields so admin-entered markup renders as text', () => {
    const element: any = {};
    (globalThis as any).document = { createElement: () => element };
    createVenuePopupContent(venue({ name: '<img src=x onerror="alert(1)">', eatLikeUs: '<script>x</script>' }));
    assert.ok(!element.innerHTML.includes('<img'));
    assert.ok(!element.innerHTML.includes('<script>'));
    assert.ok(element.innerHTML.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  });

  it('adds a walking directions link, and none without coordinates', () => {
    const element: any = {};
    (globalThis as any).document = { createElement: () => element };
    createVenuePopupContent(venue());
    assert.ok(element.innerHTML.includes('href="https://www.google.com/maps/dir/?api=1&amp;destination=53.48,-2.25&amp;travelmode=walking"'));
    assert.ok(element.innerHTML.includes('aria-label="Walking directions to Chip Shop"'));
    createVenuePopupContent(venue({ lat: null }));
    assert.ok(!element.innerHTML.includes('Walk there'));
  });

  it('binds the dossier button to the callback', () => {
    let clicked = 0;
    const button = { addEventListener: (type: string, handler: () => void) => type === 'click' && handler() };
    const element: any = { querySelector: (selector: string) => (selector === '[data-view-dossier]' ? button : null) };
    (globalThis as any).document = { createElement: () => element };
    createVenuePopupContent(venue(), () => { clicked += 1; });
    assert.equal(clicked, 1);
  });
});

describe('bindVenuePopup', () => {
  afterEach(() => {
    delete (globalThis as any).document;
  });

  function fakePopupSetup() {
    let dossierHandler: (() => void) | undefined;
    const button = { addEventListener: (_type: string, handler: () => void) => { dossierHandler = handler; } };
    const element: any = { querySelector: () => button };
    (globalThis as any).document = { createElement: () => element };
    const calls: string[] = [];
    const marker = {
      bindPopup: (content: unknown, options: any): void => {
        calls.push(`bindPopup:${content === element}:${options.className}:${options.autoPanPaddingTopLeft}`);
      },
      closePopup: (): void => {
        calls.push('closePopup');
      },
      on: (): void => {
        calls.push('on');
      },
    };
    return { marker, calls, pressDossier: () => dossierHandler?.() };
  }

  it('binds only the popup, so tapping the pin does not open the venue panel', () => {
    const { marker, calls } = fakePopupSetup();
    let opened = 0;
    bindVenuePopup(marker, venue(), () => { opened += 1; }, 70);
    assert.deepEqual(calls, ['bindPopup:true:ledger-popup:10,80']);
    assert.equal(opened, 0);
  });

  it('leaves panning to the popup unless the caller turns auto-pan off', () => {
    const { marker } = fakePopupSetup();
    const seen: unknown[] = [];
    marker.bindPopup = (_content: unknown, options: any) => { seen.push(options.autoPan); };
    bindVenuePopup(marker, venue(), () => {});
    bindVenuePopup(marker, venue(), () => {}, 0, false);
    assert.deepEqual(seen, [true, false]);
  });

  it('closes the popup before opening the venue panel from the dossier button', () => {
    const { marker, calls, pressDossier } = fakePopupSetup();
    bindVenuePopup(marker, venue(), () => calls.push('openPanel'));
    pressDossier();
    assert.deepEqual(calls.slice(1), ['closePopup', 'openPanel']);
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
