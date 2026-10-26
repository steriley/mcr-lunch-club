/**
 * Map configuration constants for MCR Lunch Club.
 * Base coordinates, default zoom levels, tile layer specifications, and walking isochrones.
 */
import { currentTheme, onThemeChange, type Theme } from '@/lib/theme';

export const BASE_LAT = 53.478997;
export const BASE_LNG = -2.252024;

export const BASE_COORDINATES = {
  lat: BASE_LAT,
  lng: BASE_LNG,
} as const;

export const BASE_LAT_LNG: [number, number] = [BASE_LAT, BASE_LNG];

export const DEFAULT_ZOOM = 15;

export interface TileLayerConfig {
  getUrl: (apiKey?: string, theme?: Theme) => string;
  attribution: string;
  subdomains: string;
  maxZoom: number;
}

/** CARTO Voyager in light mode, CARTO Dark Matter in dark mode. */
export const CARTO_VOYAGER_TILE_CONFIG: TileLayerConfig = {
  getUrl: (apiKey?: string, theme: Theme = 'light') =>
    `https://{s}.basemaps.cartocdn.com/${theme === 'dark' ? 'dark_all' : 'rastertiles/voyager'}/{z}/{x}/{y}{r}.png${
      apiKey ? `?key=${encodeURIComponent(apiKey)}` : ''
    }`,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  // CARTO serves no Voyager tiles past zoom 18; zooming further blanks the map.
  maxZoom: 18,
};

export interface IsochroneRing {
  radius: number; // in metres
  label: string;
  /** What is printed on the ring itself. */
  shortLabel: string;
  /** Leaflet `dashArray`; the rings are solid, the boundary is dashed. */
  dash?: string;
  weight: number;
}

/**
 * The one walking pace for straight-line estimates (4.8 km/h): Near Me and the
 * map's walking rings. Stored venue walking times come from ORS routes instead.
 */
export const WALKING_METRES_PER_MINUTE = 80;

/** The rings are one quiet grey (`--color-map-ring`), so the pins stay the strongest thing on the map. */
export const WALKING_RING_TOKEN = 'map-ring';

const RING_WEIGHT = 1;
const BOUNDARY_WEIGHT = 2;

const walkRing = (minutes: number): IsochroneRing => ({
  radius: minutes * WALKING_METRES_PER_MINUTE,
  label: `${minutes} min walk`,
  shortLabel: `${minutes} min`,
  weight: RING_WEIGHT,
});

export const WALKING_ISOCHRONES: IsochroneRing[] = [
  walkRing(5),
  walkRing(10),
  walkRing(15),
  walkRing(20),
  walkRing(25),
  { radius: 4023, label: '2.5-Mile Central Boundary', shortLabel: '2.5 mi', dash: '8, 8', weight: BOUNDARY_WEIGHT },
];

/**
 * A Leaflet tile layer on the CARTO basemap for the current theme. It swaps
 * basemaps when the theme changes, and stops listening once it leaves the map.
 */
export function createTileLayer(L: any, apiKey?: string): any {
  const layer = L.tileLayer(CARTO_VOYAGER_TILE_CONFIG.getUrl(apiKey, currentTheme()), {
    attribution: CARTO_VOYAGER_TILE_CONFIG.attribution,
    subdomains: CARTO_VOYAGER_TILE_CONFIG.subdomains,
    maxZoom: CARTO_VOYAGER_TILE_CONFIG.maxZoom,
  });
  const unsubscribe = onThemeChange((theme) => layer.setUrl(CARTO_VOYAGER_TILE_CONFIG.getUrl(apiKey, theme)));
  layer.on?.('remove', unsubscribe);
  return layer;
}
