import { atom } from 'nanostores';
import type { Venue, Inspection } from '@/types';
import inspectionsData from '@/data/inspections.json';

/** Id of the <script type="application/json"> tag holding the public venues. */
export const LEDGER_CANON_ELEMENT_ID = 'ledger-canon';

// Keys from the retired in-browser editing features; cleared so stale local edits never linger.
const RETIRED_STORAGE_KEYS = ['mcr_lunch_club_venues_v1', 'mcr_lunch_club_venues_v2', 'mcr_lunch_club_inspections_v1'];

function readCanonFromPage(): Venue[] {
  if (typeof document === 'undefined') return [];
  const element = document.getElementById(LEDGER_CANON_ELEMENT_ID);
  if (!element?.textContent) return [];
  try {
    return JSON.parse(element.textContent) as Venue[];
  } catch (e) {
    console.warn('Failed to parse the public venue list', e);
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
  return readCanonFromPage();
}

/** Published venues, embedded in the page by the server (see LedgerCanon.astro). */
export const $venuesList = atom<Venue[]>(getInitialVenues());
export const $inspectionsList = atom<Inspection[]>(inspectionsData as Inspection[]);

/**
 * Server-side only: provide the public venues before rendering islands so
 * their server-rendered HTML matches what hydrates in the browser.
 */
export function seedLedgerVenues(venues: Venue[]) {
  if (typeof window !== 'undefined') return;
  $venuesList.set(venues);
}
