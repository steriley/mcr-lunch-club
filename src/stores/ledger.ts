import { atom } from 'nanostores';
import type { Venue, Inspection } from '@/types';

/** Id of the <script type="application/json"> tag holding the public venues. */
export const LEDGER_CANON_ELEMENT_ID = 'ledger-canon';
/** Id of the <script type="application/json"> tag holding the public inspections. */
export const LEDGER_INSPECTIONS_ELEMENT_ID = 'ledger-inspections';

// Keys from the retired in-browser editing features; cleared so stale local edits never linger.
const RETIRED_STORAGE_KEYS = ['mcr_lunch_club_venues_v1', 'mcr_lunch_club_venues_v2', 'mcr_lunch_club_inspections_v1'];

function readListFromPage<T>(elementId: string, what: string): T[] {
  if (typeof document === 'undefined') return [];
  const element = document.getElementById(elementId);
  if (!element?.textContent) return [];
  try {
    return JSON.parse(element.textContent) as T[];
  } catch (e) {
    console.warn(`Failed to parse the public ${what}`, e);
    return [];
  }
}

function clearRetiredStorage() {
  try {
    RETIRED_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); nothing to clear then.
  }
}

/** Exported so tests can re-run the browser start-up path; the store below calls it once at import. */
export function getInitialVenues(): Venue[] {
  if (typeof window === 'undefined') return [];
  clearRetiredStorage();
  return readListFromPage<Venue>(LEDGER_CANON_ELEMENT_ID, 'venue list');
}

/** Exported so tests can re-run the browser start-up path. */
export function getInitialInspections(): Inspection[] {
  if (typeof window === 'undefined') return [];
  return readListFromPage<Inspection>(LEDGER_INSPECTIONS_ELEMENT_ID, 'inspection log');
}

/** Published venues, embedded in the page by the server (see LedgerCanon.astro). */
export const $venuesList = atom<Venue[]>(getInitialVenues());
/** Confirmed inspections of public venues, embedded alongside the venues. */
export const $inspectionsList = atom<Inspection[]>(getInitialInspections());

/**
 * Server-side only: provide the public venues before rendering islands so
 * their server-rendered HTML matches what hydrates in the browser.
 */
export function seedLedgerVenues(venues: Venue[]) {
  if (typeof window !== 'undefined') return;
  $venuesList.set(venues);
}

/** Server-side only, like seedLedgerVenues. */
export function seedLedgerInspections(inspections: Inspection[]) {
  if (typeof window !== 'undefined') return;
  $inspectionsList.set(inspections);
}
