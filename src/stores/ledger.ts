import { atom } from 'nanostores';
import type { Venue, Inspection, TierStatus } from '@/types';
import inspectionsData from '@/data/inspections.json';

// Local storage keys
const VENUES_STORAGE_KEY = 'mcr_lunch_club_venues_v2';
const LEGACY_VENUES_STORAGE_KEY = 'mcr_lunch_club_venues_v1';
const INSPECTIONS_STORAGE_KEY = 'mcr_lunch_club_inspections_v1';

/** Id of the <script type="application/json"> tag holding the published venues. */
export const LEDGER_CANON_ELEMENT_ID = 'ledger-canon';

// The published venue list from the database, embedded in the page by the server.
let canonVenues: Venue[] = [];

function readCanonFromPage(): Venue[] {
  if (typeof document === 'undefined') return [];
  const element = document.getElementById(LEDGER_CANON_ELEMENT_ID);
  if (!element?.textContent) return [];
  try {
    return JSON.parse(element.textContent) as Venue[];
  } catch (e) {
    console.warn('Failed to parse the published venue list', e);
    return [];
  }
}

/** Cheap fingerprint so local edits are dropped once the published list changes. */
function fingerprint(venues: Venue[]): string {
  const text = JSON.stringify(venues);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return `${venues.length}:${hash >>> 0}`;
}

function getInitialVenues(): Venue[] {
  if (typeof window === 'undefined') return canonVenues;

  canonVenues = readCanonFromPage();
  try {
    localStorage.removeItem(LEGACY_VENUES_STORAGE_KEY);
    const stored = localStorage.getItem(VENUES_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { canon?: string; venues?: Venue[] };
      if (parsed.canon === fingerprint(canonVenues) && Array.isArray(parsed.venues)) {
        return parsed.venues;
      }
      localStorage.removeItem(VENUES_STORAGE_KEY);
    }
  } catch (e) {
    console.warn('Failed to parse venues from localStorage', e);
  }
  return canonVenues;
}

function getInitialInspections(): Inspection[] {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(INSPECTIONS_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse inspections from localStorage', e);
    }
  }
  return inspectionsData as Inspection[];
}

export const $venuesList = atom<Venue[]>(getInitialVenues());
export const $inspectionsList = atom<Inspection[]>(getInitialInspections());

/**
 * Server-side only: provide the published venues before rendering islands so
 * their server-rendered HTML matches what hydrates in the browser.
 */
export function seedLedgerVenues(venues: Venue[]) {
  if (typeof window !== 'undefined') return;
  canonVenues = venues;
  $venuesList.set(venues);
}

// Helper to save to local storage
function persistVenues(venues: Venue[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(VENUES_STORAGE_KEY, JSON.stringify({ canon: fingerprint(canonVenues), venues }));
  }
}

function persistInspections(inspections: Inspection[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(INSPECTIONS_STORAGE_KEY, JSON.stringify(inspections));
  }
}

/**
 * Promote or demote a venue between tiers with a mandatory decree reason.
 */
export function changeVenueTier(venueSlug: string, newStatus: TierStatus, reason: string): boolean {
  if (!reason || reason.trim().length === 0) {
    alert('The Chairs require an explicit solemn reason for any status decree.');
    return false;
  }

  const currentVenues = [...$venuesList.get()];
  const idx = currentVenues.findIndex((v) => v.slug === venueSlug);
  if (idx === -1) return false;

  const prevStatus = currentVenues[idx].status;
  const updatedVenue: Venue = {
    ...currentVenues[idx],
    status: newStatus,
    rejectionReason:
      newStatus === 'Rejected' || newStatus === 'If We Must'
        ? reason
        : currentVenues[idx].rejectionReason,
    notes: `${currentVenues[idx].notes ? currentVenues[idx].notes + ' | ' : ''}Decree (${new Date().toLocaleDateString('en-GB')}): ${prevStatus} ➔ ${newStatus}: ${reason}`,
  };

  currentVenues[idx] = updatedVenue;
  $venuesList.set(currentVenues);
  persistVenues(currentVenues);

  // Automatically record this administrative verdict in inspections as an official decree log
  addInspection({
    id: `decree-${venueSlug}-${Date.now()}`,
    venueSlug,
    venueName: updatedVenue.name,
    date: new Date().toISOString().split('T')[0],
    attendees: ['The Chairs Executive Quorum'],
    verdict: newStatus === 'Approved' ? 'satisfactory' : 'sub-par',
    whatWasOrdered: `Executive Status Reclassification: ${prevStatus} ➔ ${newStatus}`,
    notes: `Official administrative decree: ${reason}`,
  });

  return true;
}

/**
 * Log an inspection (fulfilling the Two-Visit Rule)
 */
export function addInspection(inspection: Inspection) {
  const current = [inspection, ...$inspectionsList.get()];
  $inspectionsList.set(current);
  persistInspections(current);

  // Update venue lastInspectionDate
  const venues = [...$venuesList.get()];
  const vIdx = venues.findIndex((v) => v.slug === inspection.venueSlug);
  if (vIdx !== -1) {
    venues[vIdx] = {
      ...venues[vIdx],
      lastInspectionDate: inspection.date,
    };
    $venuesList.set(venues);
    persistVenues(venues);
  }
}

/**
 * Suggest a venue (enters "To Be Assessed")
 */
export function suggestVenue(params: {
  name: string;
  address: string;
  cuisine: string;
  cost: '£' | '££' | '£££';
  recommendedOrder: string;
  rationale: string;
  submitter: string;
}): Venue {
  const slug = params.name
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const newVenue: Venue = {
    id: slug,
    name: params.name,
    slug,
    status: 'To Be Assessed',
    rank: null,
    lat: 53.4800, // Central default if not geocoded
    lng: -2.2450,
    distanceMiles: 0.6,
    walkingTimeMin: 12,
    cost: params.cost,
    cuisine: params.cuisine,
    eatLikeUs: params.recommendedOrder || 'Awaiting preliminary committee sampling recommendation.',
    lastInspectionDate: 'Awaiting Assessment',
    address: params.address,
    mapSearchLink: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(params.name + ' Manchester')}`,
    notes: `Petition submitted by ${params.submitter || 'Anonymous Subject'}. Rationale: "${params.rationale}"`,
  };

  const updated = [newVenue, ...$venuesList.get()];
  $venuesList.set(updated);
  persistVenues(updated);

  return newVenue;
}

/**
 * Reset all venues and inspections back to original ledger state
 */
export function resetLedgerToCanon() {
  $venuesList.set(canonVenues);
  $inspectionsList.set(inspectionsData as Inspection[]);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(VENUES_STORAGE_KEY);
    localStorage.removeItem(INSPECTIONS_STORAGE_KEY);
  }
}
