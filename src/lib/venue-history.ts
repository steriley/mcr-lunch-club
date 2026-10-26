import { inArray } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import type { InspectionRow, TierProposalRow, VenueEventRow } from '@/db/schema';
import { cuisineLabel, isCuisineValue } from '@/lib/cuisines';
import { formatDate, formatDateTime } from '@/lib/dates';
import type { Database } from '@/lib/db-client';
import { describeInspection, listConfirmedInspections } from '@/lib/inspections';
import { describeProposal, listVenueProposals } from '@/lib/tier-proposals';
import { describeVenueEvent, listVenueEvents } from '@/lib/venue-events';
import { listVenueRevisions } from '@/lib/venues';

/**
 * One venue's audit trail, newest first: saved revisions (amendments), tier
 * proposals and decisions (motions), confirmed inspections, and actions such
 * as closing. Used by the history page and the venue page's Audit History
 * drawer. Admin-only: motions carry decline reasons.
 */

export type TimelineKind = 'amendment' | 'motion' | 'inspection' | 'event';

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  at: Date;
  /** Display time; a legacy inspection only has a date. */
  when: string;
  text: string;
  note?: string;
  /** Amendments only. */
  who?: string;
  isFirst?: boolean;
  changes?: FieldChange[];
  snapshot?: string;
}

interface RevisionRow {
  id: string;
  changedBy: string | null;
  changedAt: Date;
  snapshot: unknown;
}

// Closure and route bookkeeping show up as events or are internal.
const IGNORED = new Set(['id', 'createdAt', 'updatedAt', 'updatedBy', 'closedAt', 'closedBy', 'routeUpdatedAt']);
const LABELS: Record<string, string> = {
  name: 'Name', slug: 'Slug', tier: 'Verdict', address: 'Address', latitude: 'Latitude', longitude: 'Longitude',
  pullQuote: 'Pull quote', lunchSpecial: 'Lunch special',
  websiteUrl: 'Website', imageUrl: 'Image', cost: 'Cost', cuisine: 'Cuisine',
  distanceMiles: 'Distance', walkingTimeMin: 'Walking time', lastInspectionDate: 'Last inspection',
  mapSearchLink: 'Map link',
};

function formatValue(value: unknown, key: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'cuisine' && isCuisineValue(value)) return cuisineLabel(value);
  if (key === 'lastInspectionDate') return formatDate(String(value));
  const text = String(value);
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export function revisionEntries(revisions: RevisionRow[], editorNames: Map<string, string>): TimelineEntry[] {
  return revisions.map((revision, index) => {
    const snapshot = revision.snapshot as Record<string, unknown>;
    const previous = revisions[index + 1]?.snapshot as Record<string, unknown> | undefined;
    const changes = previous
      ? Object.keys(snapshot)
          .filter((key) => !IGNORED.has(key) && JSON.stringify(snapshot[key]) !== JSON.stringify(previous[key]))
          .map((key) => ({ field: LABELS[key] ?? key, from: formatValue(previous[key], key), to: formatValue(snapshot[key], key) }))
      : [];
    // No editor means a script: the content import made the first version; later ones are e.g. the route backfill.
    const who = revision.changedBy ? editorNames.get(revision.changedBy) ?? 'Former user' : previous ? 'a script' : 'Import script';
    const text = !previous
      ? `Earliest recorded version, by ${who}`
      : changes.length
        ? `Amended by ${who}: ${changes.map((change) => change.field).join(', ')}`
        : `Saved by ${who} with no field changes`;
    return {
      id: revision.id,
      kind: 'amendment',
      at: revision.changedAt,
      when: formatDateTime(revision.changedAt),
      text,
      who,
      isFirst: !previous,
      changes,
      snapshot: JSON.stringify(snapshot, null, 2),
    };
  });
}

export function inspectionEntries(inspections: InspectionRow[]): TimelineEntry[] {
  return inspections.map((inspection) => ({
    id: inspection.id,
    kind: 'inspection',
    // Legacy rows have no time; sort them at midday on their date.
    at: inspection.confirmedAt ?? new Date(`${inspection.inspectionDate}T12:00:00Z`),
    when: inspection.kind === 'legacy' || !inspection.confirmedAt ? formatDate(inspection.inspectionDate) : formatDateTime(inspection.confirmedAt),
    text: `Inspection of ${formatDate(inspection.inspectionDate)}: ${describeInspection(inspection)}`,
  }));
}

export function eventEntries(events: VenueEventRow[]): TimelineEntry[] {
  return events.map((event) => ({ id: event.id, kind: 'event', at: event.createdAt, when: formatDateTime(event.createdAt), text: describeVenueEvent(event) }));
}

export function motionEntries(proposals: TierProposalRow[]): TimelineEntry[] {
  return proposals.flatMap((proposal) =>
    describeProposal(proposal).map((line, index) => ({
      id: `${proposal.id}-${index}`,
      kind: 'motion' as const,
      at: line.at,
      when: formatDateTime(line.at),
      text: line.text,
      ...(line.note ? { note: line.note } : {}),
    }))
  );
}

export function sortTimeline(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function loadVenueTimeline(db: Database, venueId: string): Promise<TimelineEntry[]> {
  const [revisions, events, proposals, inspections] = await Promise.all([
    listVenueRevisions(db, venueId),
    listVenueEvents(db, venueId),
    listVenueProposals(db, venueId),
    listConfirmedInspections(db, venueId),
  ]);
  const editorIds = [...new Set(revisions.map((revision) => revision.changedBy).filter((value): value is string => Boolean(value)))];
  const editors = editorIds.length
    ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, editorIds))
    : [];
  const editorNames = new Map(editors.map((editor) => [editor.id, editor.name || editor.email]));
  return sortTimeline([
    ...revisionEntries(revisions, editorNames),
    ...eventEntries(events),
    ...motionEntries(proposals),
    ...inspectionEntries(inspections),
  ]);
}
