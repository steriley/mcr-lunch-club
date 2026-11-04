import { recordVisit as record, type VisitResult } from '@/lib/inspections';

/**
 * "Visited today" for the tests: the press's result (`waiting` or `confirmed`
 * with its details), or `{ result: <error code> }` when it was refused.
 */
export async function recordVisit(
  ...args: Parameters<typeof record>
): Promise<VisitResult | { result: 'venue_not_found' | 'outcome_required' | 'outcome_mismatch' }> {
  const outcome = await record(...args);
  return outcome.ok ? outcome.value : { result: outcome.error };
}
