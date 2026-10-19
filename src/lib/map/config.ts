/**
 * Map configuration constants for MCR Lunch Club.
 * Base coordinates, default zoom levels, tile layer specifications, and walking isochrones.
 */

export const BASE_LAT = 53.47985;
export const BASE_LNG = -2.25105;

export const BASE_COORDINATES = {
  lat: BASE_LAT,
  lng: BASE_LNG,
} as const;

export const BASE_LAT_LNG: [number, number] = [BASE_LAT, BASE_LNG];

export const DEFAULT_ZOOM = 15;

export interface TileLayerConfig {
  getUrl: (apiKey?: string) => string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

export const CARTO_VOYAGER_TILE_CONFIG: TileLayerConfig = {
  getUrl: (apiKey?: string) =>
    `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png${
      apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''
    }`,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 19,
};

export interface IsochroneRing {
  radius: number; // in metres
  color: string;
  label: string;
  dash: string;
  weight?: number;
}

export const WALKING_ISOCHRONES: IsochroneRing[] = [
  { radius: 402, color: '#059669', label: '5 min walk', dash: '3, 4' },
  { radius: 805, color: '#d97706', label: '10 min walk', dash: '3, 5' },
  { radius: 1207, color: '#2563eb', label: '15 min walk', dash: '4, 6' },
  { radius: 1609, color: '#7c3aed', label: '20 min walk', dash: '4, 6' },
  { radius: 2012, color: '#e11d48', label: '25 min walk', dash: '5, 7' },
  { radius: 4023, color: '#991b1b', label: '2.5-Mile Central Boundary', dash: '8, 8', weight: 2.5 },
];

/**
 * Helper to construct a standard Leaflet TileLayer instance using CARTO Voyager.
 */
export function createTileLayer(L: any, apiKey?: string): any {
  return L.tileLayer(CARTO_VOYAGER_TILE_CONFIG.getUrl(apiKey), {
    attribution: CARTO_VOYAGER_TILE_CONFIG.attribution,
    subdomains: CARTO_VOYAGER_TILE_CONFIG.subdomains,
    maxZoom: CARTO_VOYAGER_TILE_CONFIG.maxZoom,
  });
}
