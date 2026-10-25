import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createUserMarkerLayers } from './userMarker';

function fakeLeaflet() {
  const made: { kind: string; latlng: number[]; options: any; tooltip?: { html: string; options: any } }[] = [];
  const build = (kind: string) => (latlng: number[], options: any) => {
    const layer: any = { kind, latlng, options };
    layer.bindTooltip = (html: string, tooltipOptions: any) => {
      layer.tooltip = { html, options: tooltipOptions };
      return layer;
    };
    made.push(layer);
    return layer;
  };
  return { L: { circle: build('circle'), circleMarker: build('circleMarker') }, made };
}

describe('createUserMarkerLayers', () => {
  it('draws a blue GPS marker with the rounded accuracy', () => {
    const { L } = fakeLeaflet();
    const { marker, accuracyCircle } = createUserMarkerLayers(L, { lat: 53.48, lng: -2.24, accuracy: 24.6 });
    assert.equal(marker.options.fillColor, 'var(--color-map-you)');
    assert.equal(accuracyCircle.options.radius, 24.6);
    assert.ok(marker.tooltip.html.includes('GPS fix (±25m)'));
  });

  it('enforces a minimum accuracy radius of 10 metres', () => {
    const { L } = fakeLeaflet();
    const { accuracyCircle } = createUserMarkerLayers(L, { lat: 1, lng: 2, accuracy: 3 });
    assert.equal(accuracyCircle.options.radius, 10);
  });

  it('uses the purple manual styling when the position was set by hand', () => {
    const { L } = fakeLeaflet();
    const { marker, accuracyCircle } = createUserMarkerLayers(L, { lat: 1, lng: 2, accuracy: 50 }, true);
    assert.equal(marker.options.fillColor, 'var(--color-map-you-manual)');
    assert.equal(accuracyCircle.options.dashArray, '4, 4');
    assert.ok(marker.tooltip.html.includes('Manually set'));
  });
});
