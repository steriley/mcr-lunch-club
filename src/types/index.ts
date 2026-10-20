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

export interface Inspection {
  id: string;
  venueSlug: string;
  venueName: string;
  date: string;
  attendees: string[];
  verdict: 'satisfactory' | 'sub-par';
  whatWasOrdered: string;
  notes?: string;
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
