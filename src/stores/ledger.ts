import { atom } from 'nanostores';
import type { Venue, Inspection, TierStatus } from '@/types';
import venuesData from '@/data/venues.json';
import inspectionsData from '@/data/inspections.json';

// Local storage keys
const VENUES_STORAGE_KEY = 'mcr_lunch_club_venues_v1';
const INSPECTIONS_STORAGE_KEY = 'mcr_lunch_club_inspections_v1';

function getInitialVenues(): Venue[] {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(VENUES_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to parse venues from localStorage', e);
    }
  }
  return venuesData as Venue[];
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

// Helper to save to local storage
function persistVenues(venues: Venue[]) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(VENUES_STORAGE_KEY, JSON.stringify(venues));
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
  $venuesList.set(venuesData as Venue[]);
  $inspectionsList.set(inspectionsData as Inspection[]);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(VENUES_STORAGE_KEY);
    localStorage.removeItem(INSPECTIONS_STORAGE_KEY);
  }
}
