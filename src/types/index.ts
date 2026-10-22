import type { TierValue } from '@/lib/tiers';

export type CostTier = '£' | '££' | '£££';

/**
 * A venue's primary photo as shown publicly (#35). `thumbUrl` falls back to
 * the full image for photos migrated from the old single image link; `alt`
 * is the caption, or the venue name when there is none. Crop with
 * `object-position: focalX% focalY%` (centre when null).
 */
export interface PublicImage {
  url: string;
  thumbUrl: string;
  width: number | null;
  height: number | null;
  alt: string;
  focalX: number | null;
  focalY: number | null;
}

export interface Venue {
  id: string;
  name: string;
  slug: string;
  tier: TierValue;
  lat: number | null;
  lng: number | null;
  /** Walking route from HQ; null while the route is pending. */
  distanceMiles: number | null;
  walkingTimeMin: number | null;
  cost: CostTier;
  cuisine: string;
  eatLikeUs: string;
  lastInspectionDate: string;
  address: string;
  mapSearchLink: string;
  /** The primary photo; null or absent when the venue has none. */
  image?: PublicImage | null;
}

/** How an inspection went. */
export type InspectionOutcome = 'satisfactory' | 'below_par';

/** A confirmed inspection, as recorded in the Chairs' Area. */
export interface Inspection {
  id: string;
  venueSlug: string;
  venueName: string;
  /** YYYY-MM-DD: the London day of the visit. */
  date: string;
  /** verified: two Chairs pressed "Visited today" that day. legacy: imported from the Chairs' older records. */
  kind: 'verified' | 'legacy';
  /** How it went; null for a legacy record, which is a date only. */
  outcome: InspectionOutcome | null;
  /** The two Chairs who confirmed a verified inspection; empty for a legacy record. */
  chairs: string[];
}

export interface Incident {
  id: string;
  date: string;
  title: string;
  peopleInvolved: string[];
  witnesses: string[];
  benefitOffered: string;
  value: string;
  context: string;
  outcome: string;
  location?: string;
  time?: string;
  formattedDate?: string;
}

export interface FilterState {
  tiers: TierValue[];
  cost: CostTier | 'all';
  maxWalkMinutes: number;
  inspectedDays: number | 'all';
  cuisine: string | 'all';
  searchQuery: string;
}
