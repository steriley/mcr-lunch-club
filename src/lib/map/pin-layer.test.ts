import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Venue } from '@/types';
import { createVenuePinLayer } from './pin-layer';

/** Just enough Leaflet: markers that record their handlers, icon, z-index and classes. */
function fakeLeaflet() {
  const classes = () => {
    const set = new Set<string>();
    return {
      set,
      toggle: (name: string, on: boolean) => (on ? set.add(name) : set.delete(name)),
    };
  };
  const L = {
    divIcon: (options: any) => ({ ...options }),
    layerGroup: () => {
      const layers = new Set<any>();
      return {
        layers,
        addLayer: (marker: any) => {
          layers.add(marker);
          marker.fire('add');
        },
        removeLayer: (marker: any) => layers.delete(marker),
        clearLayers: () => layers.clear(),
      };
    },
    marker: (latlng: [number, number], options: any) => {
      const handlers = new Map<string, Array<(event?: any) => void>>();
      const classList = classes();
      const marker = {
        latlng,
        icon: options.icon,
        zIndexOffset: 0,
        classList: classList.set,
        on: (name: string, handler: (event?: any) => void) =>
          handlers.set(name, [...(handlers.get(name) ?? []), handler]),
        fire: (name: string, event?: any) => handlers.get(name)?.forEach((h) => h(event)),
        setIcon: (icon: any) => (marker.icon = icon),
        setZIndexOffset: (offset: number) => (marker.zIndexOffset = offset),
        getElement: () => ({ classList }),
      };
      return marker;
    },
  };
  return L;
}

function venue(id: string, lat = 53.48, lng = -2.25): Venue {
  return {
    id,
    name: id,
    slug: id,
    tier: 'approved',
    lat,
    lng,
    distanceMiles: 0.3,
    walkingTimeMin: 6,
    cost: '££',
    cuisine: 'British',
    eatLikeUs: '',
    lastInspectionDate: '2026-09-01',
    address: '',
    mapSearchLink: '',
  };
}

const keydown = (key: string) => {
  const event = { key, prevented: false, preventDefault: () => (event.prevented = true) };
  return { originalEvent: event };
};

describe('venue pin layer', () => {
  it('draws a pin per located venue and leaves out those without a location', () => {
    const pins = createVenuePinLayer(fakeLeaflet(), () => {});
    pins.sync([{ venue: venue('a') }, { venue: { ...venue('b'), lat: null, lng: null } }]);
    assert.deepEqual(pins.ids(), ['a']);
  });

  it('keeps a pin between syncs, and replaces only those that moved or went', () => {
    const pins = createVenuePinLayer(fakeLeaflet(), () => {});
    pins.sync([{ venue: venue('a') }, { venue: venue('b') }]);
    const a = pins.get('a');
    const b = pins.get('b');
    pins.sync([{ venue: venue('a') }, { venue: venue('b'), at: { lat: 53.5, lng: -2.2 } }]);
    assert.equal(pins.get('a'), a);
    assert.notEqual(pins.get('b'), b);
    pins.sync([{ venue: venue('b'), at: { lat: 53.5, lng: -2.2 } }]);
    assert.deepEqual(pins.ids(), ['b']);
    assert.equal(pins.layer.layers.size, 1);
  });

  it('swaps the icon, not the marker, when a rank changes', () => {
    const pins = createVenuePinLayer(fakeLeaflet(), () => {});
    pins.sync([{ venue: venue('a'), rank: 1 }]);
    const marker = pins.get('a');
    const icon = marker.icon;
    pins.sync([{ venue: venue('a'), rank: 2 }]);
    assert.equal(pins.get('a'), marker);
    assert.notEqual(marker.icon, icon);
  });

  it('answers to a tap, Enter and Space, and to no other key', () => {
    const calls: Array<[string, boolean]> = [];
    const pins = createVenuePinLayer(fakeLeaflet(), (v, viaKeyboard) =>
      calls.push([v.id, viaKeyboard])
    );
    pins.sync([{ venue: venue('a') }]);
    const marker = pins.get('a');
    marker.fire('click');
    const enter = keydown('Enter');
    marker.fire('keydown', enter);
    marker.fire('keydown', keydown(' '));
    marker.fire('keydown', keydown('a'));
    assert.deepEqual(calls, [
      ['a', false],
      ['a', true],
      ['a', true],
    ]);
    assert.equal(enter.originalEvent.prevented, true);
  });

  it('marks and raises the selected pin, including one drawn after the selection', () => {
    const pins = createVenuePinLayer(fakeLeaflet(), () => {});
    pins.sync([{ venue: venue('a') }, { venue: venue('b') }]);
    pins.select('a');
    assert.ok(pins.get('a').classList.has('is-selected-pin'));
    assert.equal(pins.get('a').zIndexOffset, 1000);
    assert.ok(!pins.get('b').classList.has('is-selected-pin'));

    pins.select('c');
    pins.sync([{ venue: venue('a') }, { venue: venue('c') }]);
    assert.ok(pins.get('c').classList.has('is-selected-pin'));
    assert.equal(pins.get('a').zIndexOffset, 0);
  });
});
