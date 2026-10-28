import type { Inspection, InspectionOutcome } from '@/types';

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
