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
  const fillColor = isManual ? '#9333ea' : '#2563eb';
  const strokeColor = '#ffffff';

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
    ? '<b>Your Location</b><br/><span style="color:#7e22ce;">Manually set</span>'
    : `<b>Your Location</b><br/><span style="color:#2563eb;">GPS fix (±${Math.round(pos.accuracy)}m)</span>`;

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
