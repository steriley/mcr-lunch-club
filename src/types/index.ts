export type TierStatus =
  | 'Approved'
  | 'Under Consideration'
  | 'To Be Assessed'
  | 'Rejected'
  | 'If We Must'
  | 'Gone But Not Forgotten';

export type CostTier = '£' | '££' | '£££';

export interface Venue {
  id: string;
  name: string;
  slug: string;
  status: TierStatus;
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
  tiers: TierStatus[];
  showAllTiers: boolean;
  cost: CostTier | 'all';
  maxWalkMinutes: number;
  inspectedDays: number | 'all';
  cuisine: string | 'all';
  searchQuery: string;
}
