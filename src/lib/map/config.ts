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

/**
 * The one walking pace for straight-line estimates (4.8 km/h): Near Me and the
 * map's walking rings. Stored venue walking times come from ORS routes instead.
 */
export const WALKING_METRES_PER_MINUTE = 80;

const walkRing = (minutes: number, color: string, dash: string): IsochroneRing => ({
  radius: minutes * WALKING_METRES_PER_MINUTE,
  color,
  label: `${minutes} min walk`,
  dash,
});

export const WALKING_ISOCHRONES: IsochroneRing[] = [
  walkRing(5, '#059669', '3, 4'),
  walkRing(10, '#d97706', '3, 5'),
  walkRing(15, '#2563eb', '4, 6'),
  walkRing(20, '#7c3aed', '4, 6'),
  walkRing(25, '#e11d48', '5, 7'),
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
