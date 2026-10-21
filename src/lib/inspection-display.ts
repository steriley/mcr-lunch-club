import type { Inspection } from '@/types';

/** Badge text for a public inspection. */
export const INSPECTION_KIND_LABELS: Record<Inspection['kind'], string> = {
  verified: 'Dual-verified',
  legacy: 'Legacy record',
};

/** "Verified by Sam and Alex", or where a legacy record came from. */
export function inspectionWitnesses(inspection: Pick<Inspection, 'kind' | 'chairs'>): string {
  if (inspection.kind === 'legacy' || inspection.chairs.length === 0) return "From the Chairs' earlier records";
  return `Verified by ${inspection.chairs.join(' and ')}`;
}
