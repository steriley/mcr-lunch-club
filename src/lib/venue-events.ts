import { desc, eq } from 'drizzle-orm';
import { venueEvents, type VenueEventRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';

/**
 * Log of admin actions on a venue that are not field edits. Each entry keeps
 * the admin's display name as a snapshot, so history survives account
 * deletion. Kinds are added by the phases that need them.
 */
export type VenueEventKind = 'closed' | 'reopened';

export interface Actor {
  id: string;
  name: string | null;
  email?: string | null;
}

/** The name shown in history: display name, else email. */
export function actorName(actor: Actor): string {
  return actor.name?.trim() || actor.email?.trim() || 'Unknown admin';
}

export async function recordVenueEvent(
  db: Pick<Database, 'insert'>,
  venueId: string,
  kind: VenueEventKind,
  actor: Actor,
  detail: Record<string, unknown> | null = null
): Promise<void> {
  await db.insert(venueEvents).values({ venueId, kind, actorId: actor.id, actorName: actorName(actor), detail });
}

export async function listVenueEvents(db: Database, venueId: string): Promise<VenueEventRow[]> {
  return db.select().from(venueEvents).where(eq(venueEvents.venueId, venueId)).orderBy(desc(venueEvents.createdAt)).limit(200);
}

export function formatEventDate(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
}

const EVENT_VERBS: Record<VenueEventKind, string> = {
  closed: 'Closed',
  reopened: 'Reopened',
};

/** e.g. "Closed by Sam on 21 Oct 2026". */
export function describeVenueEvent(event: Pick<VenueEventRow, 'kind' | 'actorName' | 'createdAt'>): string {
  const verb = EVENT_VERBS[event.kind as VenueEventKind] ?? event.kind;
  return `${verb} by ${event.actorName ?? 'a former admin'} on ${formatEventDate(event.createdAt)}`;
}
