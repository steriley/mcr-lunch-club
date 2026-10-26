import { compareByWalkingTime, compareNames, sortByRecentInspection } from '@/lib/venue-order';
import type { ResultsSort } from '@/stores/results';
import type { Inspection, Venue } from '@/types';

/** The list's order: nearest to Base (walking time, unknown last), by name, or most recently inspected first. */
export function sortResults(venues: readonly Venue[], sort: ResultsSort, inspections: readonly Inspection[]): Venue[] {
  if (sort === 'name') return [...venues].sort(compareNames);
  if (sort === 'inspected') return sortByRecentInspection(venues, inspections);
  return [...venues].sort(compareByWalkingTime);
}

/** The count line above the list: "56 venues", "1 venue". */
export function resultsCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'venue' : 'venues'}`;
}
