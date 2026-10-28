import type { Venue } from '@/types';
import { BASE_LAT, BASE_LNG } from './config';
import { haversineMetres } from './ranking';

/**
 * Text labels on the map: venue names beside their pins, and the walking rings'
 * minutes printed on the rings. Pure maths over rectangles in screen pixels, so
 * it needs no Leaflet and can be tested on its own.
 */

/** Venue names show from this zoom; below it pins are too close for names to fit. */
export const NAME_MIN_ZOOM = 16;

/** The size of a pin and of a cluster marker, as drawn (see markers.ts). */
const PIN = { width: 28, height: 34, anchorX: 14, anchorY: 30 };
const CLUSTER_SIZE = 44;

/** A pin's disc sits this far above the venue's point, so a name lines up with the disc. */
const PIN_DISC_LIFT_PX = 16;
/** Between a pin's edge and the name beside it. */
const NAME_GAP_PX = 4;
export const NAME_HEIGHT_PX = 16;
/** Breathing room kept around every placed label. */
const LABEL_PADDING_PX = 2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** A label that can sit in any of several places; `options` are in order of preference. */
export interface LabelCandidate {
  id: string;
  options: Rect[];
}

const inflate = (rect: Rect, by: number): Rect => ({
  x: rect.x - by,
  y: rect.y - by,
  width: rect.width + by * 2,
  height: rect.height + by * 2,
});

/** True when two rectangles share any area (touching edges don't count). */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The space a venue pin takes up, given where its point is. */
export function pinRect(point: Point): Rect {
  return {
    x: point.x - PIN.anchorX,
    y: point.y - PIN.anchorY,
    width: PIN.width,
    height: PIN.height,
  };
}

/** The space a cluster marker takes up: it is centred on its point. */
export function clusterRect(point: Point): Rect {
  return {
    x: point.x - CLUSTER_SIZE / 2,
    y: point.y - CLUSTER_SIZE / 2,
    width: CLUSTER_SIZE,
    height: CLUSTER_SIZE,
  };
}

/** Where a venue's name can go: beside its pin's disc, on the right if there is room, else on the left. */
export function nameOptions(point: Point, width: number): Rect[] {
  const y = point.y - PIN_DISC_LIFT_PX - NAME_HEIGHT_PX / 2;
  const reach = PIN.width / 2 + NAME_GAP_PX;
  return [
    { x: point.x + reach, y, width, height: NAME_HEIGHT_PX },
    { x: point.x - reach - width, y, width, height: NAME_HEIGHT_PX },
  ];
}

/** How far round the ring, in degrees, successive options for a ring's label are tried. */
const RING_BEARING_STEP = 6;

/**
 * Where a walking ring's label can go: centred on the ring itself, trying due
 * north first and then fanning out either side. `within` keeps it to what is on
 * screen, so a ring that is half off the map is labelled where it can be read.
 */
export function ringLabelOptions(
  centre: Point,
  radiusPx: number,
  size: { width: number; height: number },
  within: Rect
): Rect[] {
  const options: Rect[] = [];
  for (let step = 0; step * RING_BEARING_STEP <= 180; step++) {
    // 0, +6, -6, +12, -12 ...: nearest to north first.
    for (const sign of step === 0 ? [1] : [1, -1]) {
      const bearing = (sign * step * RING_BEARING_STEP * Math.PI) / 180;
      const x = centre.x + Math.sin(bearing) * radiusPx - size.width / 2;
      const y = centre.y - Math.cos(bearing) * radiusPx - size.height / 2;
      const rect = { x, y, width: size.width, height: size.height };
      if (
        rect.x >= within.x &&
        rect.y >= within.y &&
        rect.x + rect.width <= within.x + within.width &&
        rect.y + rect.height <= within.y + within.height
      ) {
        options.push(rect);
      }
    }
  }
  return options;
}

/**
 * Places labels greedily, in the order given: each takes its first option that
 * touches neither an obstacle nor a label placed before it, and is left out if
 * none does. Returns the chosen option's index for each label that fits.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  obstacles: readonly Rect[]
): Map<string, number> {
  const taken: Rect[] = [...obstacles];
  const placed = new Map<string, number>();
  for (const candidate of candidates) {
    const index = candidate.options.findIndex((option) => {
      const box = inflate(option, LABEL_PADDING_PX);
      return !taken.some((other) => overlaps(box, other));
    });
    if (index === -1) continue;
    placed.set(candidate.id, index);
    taken.push(candidate.options[index]);
  }
  return placed;
}

/** Whose name is shown first when there isn't room for all: Approved venues, then the nearest to Base. */
export function byNamePriority(venues: readonly Venue[]): Venue[] {
  const base = { lat: BASE_LAT, lng: BASE_LNG };
  const distance = (venue: Venue) =>
    venue.lat == null || venue.lng == null
      ? Infinity
      : haversineMetres(base, { lat: venue.lat, lng: venue.lng });
  const rank = (venue: Venue) => (venue.tier === 'approved' ? 0 : 1);
  return [...venues].sort((a, b) => rank(a) - rank(b) || distance(a) - distance(b));
}

/** The text of a venue's name label: "Crazy Pedro's · ££". */
export function nameLabelText(venue: Pick<Venue, 'name' | 'cost'>): string {
  return venue.cost ? `${venue.name} · ${venue.cost}` : venue.name;
}

/** The widest a name label grows before it is cut short with an ellipsis. */
export const NAME_MAX_WIDTH_PX = 176;
const LABEL_SIDE_PADDING_PX = 6;
const FALLBACK_CHAR_PX = 6.6;

let canvasContext: CanvasRenderingContext2D | null | undefined;

/** The width a label needs: measured in the label's own font in a browser, estimated elsewhere. */
export function labelWidth(text: string, font: string, maxWidth = NAME_MAX_WIDTH_PX): number {
  if (canvasContext === undefined) {
    canvasContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  let measured = text.length * FALLBACK_CHAR_PX;
  if (canvasContext) {
    canvasContext.font = font;
    measured = canvasContext.measureText(text).width;
  }
  return Math.min(Math.ceil(measured) + LABEL_SIDE_PADDING_PX, maxWidth);
}
