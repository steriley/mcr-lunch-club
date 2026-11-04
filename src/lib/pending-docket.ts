import type { PendingInspection, VisitStatus } from '@/lib/inspections';
import type { SerializedProposal } from '@/lib/tier-proposals';
import type { SerializedVisit } from '@/lib/visits';

/**
 * The Pending page: everything waiting for a second Chair, one entry per venue. A venue the
 * Chairs visited together often has both today's inspection and a verdict motion waiting, and
 * the other Chair should be able to sign both from one place.
 */
export interface PendingEntry {
  venueId: string;
  venueName: string;
  /** Today's inspection still waiting for its cosigner, or null. */
  inspection: VisitStatus | null;
  /** The venue's pending verdict motion, or null. */
  proposal: SerializedProposal | null;
  /** "21 Oct 2026, verified by Sam and Alex, satisfactory", or null when there is none. */
  latestVerifiedInspection: string | null;
  /** The visits (with field notes) behind today's unsigned inspection: what the cosigner reads. */
  inspectionVisits: SerializedVisit[];
  /** The visits behind the inspection the motion cites, if it cites one: the motion's evidence. */
  motionVisits: SerializedVisit[];
}

/** True when `userId` can sign something on this entry: a cosign, or a decision on someone else's motion. */
export function entryNeedsUser(
  entry: Pick<PendingEntry, 'inspection' | 'proposal'>,
  userId: string
): boolean {
  const cosign = Boolean(entry.inspection?.pending && !entry.inspection.pending.byMe);
  const decide = Boolean(entry.proposal && entry.proposal.proposedBy !== userId);
  return cosign || decide;
}

function earliest(entry: PendingEntry): string {
  const times = [entry.inspection?.pending?.firstAt, entry.proposal?.proposedAt].filter(
    (time): time is string => Boolean(time)
  );
  return times.sort()[0] ?? '';
}

/**
 * Merges the two lists by venue. Entries the user can act on come first, then those waiting on
 * someone else; each group runs oldest first.
 */
export function buildPendingEntries(
  inspections: readonly PendingInspection[],
  proposals: readonly (SerializedProposal & { venueName: string })[],
  latestVerifiedInspection: ReadonlyMap<string, string | null>,
  visitsByInspection: ReadonlyMap<string, SerializedVisit[]>,
  userId: string
): PendingEntry[] {
  const byVenue = new Map<string, PendingEntry>();
  const entryFor = (venueId: string, venueName: string) => {
    let entry = byVenue.get(venueId);
    if (!entry) {
      entry = {
        venueId,
        venueName,
        inspection: null,
        proposal: null,
        latestVerifiedInspection: latestVerifiedInspection.get(venueId) ?? null,
        inspectionVisits: [],
        motionVisits: [],
      };
      byVenue.set(venueId, entry);
    }
    return entry;
  };
  const visitsFor = (inspectionId: string | null) =>
    (inspectionId && visitsByInspection.get(inspectionId)) || [];
  for (const item of inspections) {
    const entry = entryFor(item.venueId, item.venueName);
    entry.inspection = item.status;
    entry.inspectionVisits = visitsFor(item.inspectionId);
  }
  for (const { venueName, ...proposal } of proposals) {
    const entry = entryFor(proposal.venueId, venueName);
    entry.proposal = proposal;
    entry.motionVisits = visitsFor(proposal.inspectionId);
  }

  return [...byVenue.values()].sort((a, b) => {
    const needs = Number(entryNeedsUser(b, userId)) - Number(entryNeedsUser(a, userId));
    return needs || earliest(a).localeCompare(earliest(b));
  });
}
