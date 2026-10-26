import { atom } from 'nanostores';

/**
 * State shared by the home map and its venue list, which sit in different places on the page
 * (the list is a tab beside the map on desktop, a disclosure under it on a phone) and know
 * nothing of each other.
 */

/** The venue shown on the map's card. `source` says where the choice came from: the map or the list. */
export interface MapSelection {
  id: string;
  source: 'map' | 'list';
}

export const $mapSelection = atom<MapSelection | null>(null);

/** The venue whose list row is under the pointer or focus; its pin lights up. */
export const $hoveredVenueId = atom<string | null>(null);

export type ResultsSort = 'nearest' | 'name' | 'inspected';

export const RESULTS_SORTS: ReadonlyArray<{ value: ResultsSort; label: string }> = [
  { value: 'nearest', label: 'Nearest to Base' },
  { value: 'name', label: 'Name' },
  { value: 'inspected', label: 'Last inspected' },
];

export const $resultsSort = atom<ResultsSort>('nearest');

export function selectMapVenue(id: string | null, source: MapSelection['source'] = 'map') {
  $mapSelection.set(id === null ? null : { id, source });
}

export function setHoveredVenue(id: string | null) {
  $hoveredVenueId.set(id);
}

export function setResultsSort(sort: ResultsSort) {
  $resultsSort.set(sort);
}
