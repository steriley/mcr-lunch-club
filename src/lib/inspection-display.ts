import type { Inspection, InspectionOutcome } from '@/types';
import { formatDate } from '@/lib/dates';

/** Badge text for a public inspection. */
export const INSPECTION_KIND_LABELS: Record<Inspection['kind'], string> = {
  verified: 'Dual-verified',
  legacy: 'Legacy record',
};

export const INSPECTION_OUTCOMES: InspectionOutcome[] = ['satisfactory', 'below_par'];

export const INSPECTION_OUTCOME_LABELS: Record<InspectionOutcome, string> = {
  satisfactory: 'Satisfactory',
  below_par: 'Below par',
};

/** Tailwind classes for the outcome badge: green for satisfactory, red for below par. */
export const INSPECTION_OUTCOME_BADGE_CLASSES: Record<InspectionOutcome, string> = {
  satisfactory: 'bg-emerald-50 text-emerald-800 border-emerald-300',
  below_par: 'bg-red-50 text-red-800 border-red-300',
};

/** "Verified by Sam and Alex", or where a legacy record came from. */
export function inspectionWitnesses(inspection: {
  kind: Inspection['kind'];
  chairs: readonly string[];
}): string {
  if (inspection.kind === 'legacy' || inspection.chairs.length === 0)
    return "From the Chairs' earlier records";
  return `Verified by ${inspection.chairs.join(' and ')}`;
}

/** "21st Oct 26, verified by Sam and Alex, satisfactory": a just-confirmed visit, as the Chairs' Area lists it. */
export function verifiedVisitSummary(
  date: string,
  visit: { firstAdminName: string; secondAdminName: string; outcome: InspectionOutcome | null }
): string {
  const outcome = visit.outcome
    ? `, ${INSPECTION_OUTCOME_LABELS[visit.outcome].toLowerCase()}`
    : '';
  return `${formatDate(date)}, verified by ${visit.firstAdminName} and ${visit.secondAdminName}${outcome}`;
}

/**
 * How a visit stands, from the inspection it belongs to (if any): "Pending", "Confirmed: below par",
 * "Unconfirmed" or "Visit only". Here rather than in src/lib/visits.ts so an island can relabel a
 * visit once its inspection is cosigned.
 */
export function visitStatusLabel(
  inspection: {
    status: 'pending' | 'confirmed' | 'lapsed';
    outcome: InspectionOutcome | null;
  } | null
): string {
  if (!inspection) return 'Visit only';
  if (inspection.status === 'pending') return 'Pending';
  if (inspection.status === 'lapsed') return 'Unconfirmed';
  return inspection.outcome
    ? `Confirmed: ${INSPECTION_OUTCOME_LABELS[inspection.outcome].toLowerCase()}`
    : 'Confirmed';
}
