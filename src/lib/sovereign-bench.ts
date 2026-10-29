import { formatDate } from '@/lib/dates';
import { getWalkingDirectionsUrl } from '@/lib/map/directions';
import type { GoldenCutVenue, PublicVenue } from '@/lib/public-data';
import { milesText, walkText } from '@/lib/route-display';
import type { CostTier, Inspection, PublicImage } from '@/types';

/** How many cards the bench shows: one hero and up to four pillars. */
const BENCH_SIZE = 5;

export interface BenchWalk {
  /** "9 min walk (0.40 mi)". */
  label: string;
  lat: number | null;
  lng: number | null;
  /** Google walking directions; null (plain text, no link) when the route or coordinates are missing. */
  directionsUrl: string | null;
}

export interface BenchCard {
  slug: string;
  name: string;
  href: string;
  cost: CostTier;
  /** The venue's primary photo; null when it has none (the card shows the crest placeholder). */
  image: PublicImage | null;
  /**
   * The newest confirmed inspection, formatted. With none: "Awaiting" for To Be Assessed, "Legacy" for
   * Approved and Under Consideration, and null for every other tier.
   */
  lastInspection: string | null;
  /** Confirmed inspections (verified + legacy). */
  inspectionCount: number;
  /** Null while the route is pending: the card shows no walk row. */
  walk: BenchWalk | null;
  /** The Chairs' puff piece, trimmed; null when blank. */
  quote: string | null;
  /** The anchor dish, then the lunch special; null when both are blank. */
  eatLikeUs: string | null;
}

export interface SovereignBench {
  /** golden-cut: the Chairs' picks. nearest: the nearest Approved venues. */
  mode: 'golden-cut' | 'nearest';
  /** Null only when there is nothing to show at all. */
  hero: BenchCard | null;
  /** Ranks #02 to #05; empty when there is only a hero. */
  pillars: BenchCard[];
}

export interface Pick {
  venue: PublicVenue;
  puffPiece?: string | null;
  anchorDish?: string | null;
}

function clean(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  return trimmed ? trimmed : null;
}

function walkFor(venue: PublicVenue): BenchWalk | null {
  const { walkingTimeMin, distanceMiles, lat, lng } = venue;
  if (walkingTimeMin === null) return null;
  const label =
    distanceMiles === null
      ? walkText(walkingTimeMin)
      : `${walkText(walkingTimeMin)} (${milesText(distanceMiles, 'mi')})`;
  if (lat === null || lng === null) return { label, lat: null, lng: null, directionsUrl: null };
  // 'server' is not an Apple platform, so this is always the Google URL; the page script swaps it on Apple devices.
  return { label, lat, lng, directionsUrl: getWalkingDirectionsUrl(lat, lng, 'server') };
}

function lastInspectionFor(tier: PublicVenue['tier'], newest: string | null): string | null {
  if (newest !== null) return formatDate(newest);
  if (tier === 'to_be_assessed') return 'Awaiting';
  return tier === 'approved' || tier === 'under_consideration' ? 'Legacy' : null;
}

export function toCard(pick: Pick, inspections: Inspection[]): BenchCard {
  const { venue } = pick;
  const own = inspections.filter((inspection) => inspection.venueSlug === venue.slug);
  // YYYY-MM-DD sorts as text, so the order of the input does not matter.
  const newest = own.reduce<string | null>(
    (latest, { date }) => (latest === null || date > latest ? date : latest),
    null
  );
  return {
    slug: venue.slug,
    name: venue.name,
    href: `/venues/${venue.slug}`,
    cost: venue.cost,
    image: venue.image ?? null,
    lastInspection: lastInspectionFor(venue.tier, newest),
    inspectionCount: own.length,
    walk: walkFor(venue),
    quote: clean(pick.puffPiece),
    // The prescribed order is an Approved honour: no other verdict ever shows one.
    eatLikeUs:
      venue.tier === 'approved' ? (clean(pick.anchorDish) ?? clean(venue.eatLikeUs)) : null,
  };
}

/** What the card says under the name: the Chairs' quote, else the prescribed order; null when neither. */
export function cardBlurb(card: {
  quote: string | null;
  eatLikeUs: string | null;
}): { kind: 'quote' | 'eat'; text: string } | null {
  if (card.quote) return { kind: 'quote', text: card.quote };
  if (card.eatLikeUs) return { kind: 'eat', text: `Eat like us: ${card.eatLikeUs}` };
  return null;
}

/** "0 Inspections" / "1 Inspection" / "3 Inspections". */
export function inspectionCountLabel(card: { inspectionCount: number }): string {
  const { inspectionCount: n } = card;
  return `${n} ${n === 1 ? 'Inspection' : 'Inspections'}`;
}

/**
 * The homepage "Sovereign Bench": the Chairs' Golden Cut when they have picked
 * any (no padding when it is short), otherwise the nearest Approved venues.
 * `venues` is in public order, nearest first. `inspections` are confirmed ones.
 */
export function buildSovereignBench(
  goldenCut: GoldenCutVenue[],
  venues: PublicVenue[],
  inspections: Inspection[]
): SovereignBench {
  const mode = goldenCut.length > 0 ? 'golden-cut' : 'nearest';
  const picks: Pick[] =
    mode === 'golden-cut'
      ? goldenCut
      : venues.filter((venue) => venue.tier === 'approved').map((venue) => ({ venue }));
  const [hero = null, ...pillars] = picks
    .slice(0, BENCH_SIZE)
    .map((pick) => toCard(pick, inspections));
  return { mode, hero, pillars };
}
