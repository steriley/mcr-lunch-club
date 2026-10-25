import { themeColor } from '@/lib/theme-color';
import type { UserPosition } from './useGeolocation';

export interface UserMarkerLayers {
  marker: any;
  accuracyCircle: any;
}

/**
 * Creates or updates the user position circleMarker and accuracy circle on a Leaflet map.
 */
export function createUserMarkerLayers(
  L: any,
  pos: UserPosition,
  isManual = false
): UserMarkerLayers {
  const fillColor = themeColor(isManual ? 'map-you-manual' : 'map-you');
  const strokeColor = themeColor('white');

  // Pulsing / distinct outer halo via divIcon or styled circleMarker
  const accuracyCircle = L.circle([pos.lat, pos.lng], {
    radius: Math.max(pos.accuracy, 10),
    color: fillColor,
    weight: 1,
    dashArray: isManual ? '4, 4' : '2, 4',
    fillColor: fillColor,
    fillOpacity: 0.12,
    interactive: false,
  });

  const marker = L.circleMarker([pos.lat, pos.lng], {
    radius: 9,
    fillColor: fillColor,
    fillOpacity: 1,
    color: strokeColor,
    weight: 2.5,
    zIndexOffset: 1500,
  });

  const tooltipText = isManual
    ? '<b>Your Location</b><br/><span style="color:var(--color-map-you-manual-ink);">Manually set</span>'
    : `<b>Your Location</b><br/><span style="color:var(--color-map-you);">GPS fix (±${Math.round(pos.accuracy)}m)</span>`;

  marker.bindTooltip(tooltipText, {
    direction: 'top',
    offset: [0, -10],
    className: 'ring-label',
  });

  return {
    marker,
    accuracyCircle,
  };
}
