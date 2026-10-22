import { desc, eq } from 'drizzle-orm';
import { venueEvents, type VenueEventRow } from '@/db/schema';
import { formatDate } from '@/lib/dates';
import type { Database } from '@/lib/db-client';

/**
 * Log of admin actions on a venue that are not field edits. Each entry keeps
 * the admin's display name as a snapshot, so history survives account
 * deletion. Kinds are added by the phases that need them.
 */
export type VenueEventKind = 'closed' | 'reopened' | 'image_added' | 'image_removed' | 'image_primary_changed';

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

const EVENT_VERBS: Record<VenueEventKind, string> = {
  closed: 'Closed',
  reopened: 'Reopened',
  image_added: 'Photo added',
  image_removed: 'Photo removed',
  image_primary_changed: 'Primary photo changed',
};

/** e.g. "Closed by Sam on 21st Oct 26" or "Photo added by Sam on 22nd Oct 26". Text only, never an image. */
export function describeVenueEvent(event: Pick<VenueEventRow, 'kind' | 'actorName' | 'createdAt'>): string {
  const verb = EVENT_VERBS[event.kind as VenueEventKind] ?? event.kind;
  return `${verb} by ${event.actorName ?? 'a former admin'} on ${formatDate(event.createdAt)}`;
}
