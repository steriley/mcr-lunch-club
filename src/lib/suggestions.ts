import { createHmac } from 'node:crypto';
import { and, count, eq, gte } from 'drizzle-orm';
import { venueSuggestions, venues, type SuggestionRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { getAuthEnvironment } from '@/lib/env';
import { venueInputSchema, slugify } from '@/lib/venue-schema';
import { isSlugTaken, recordVenueRevision, venueValues } from '@/lib/venues';

/** Per-sender limit for the public form. */
export const SUGGESTIONS_PER_SENDER_PER_HOUR = 3;
/** Site-wide ceiling so a flood can't bury the inbox. */
export const SUGGESTIONS_PER_DAY = 50;

/** Keyed hash of the sender's IP so the raw address is never stored. */
export function senderHash(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac('sha256', getAuthEnvironment().secret).update(`suggestion:${ip}`).digest('hex').slice(0, 32);
}

export async function isSuggestionRateLimited(db: Database, hash: string | null): Promise<boolean> {
  const now = Date.now();
  const [daily] = await db
    .select({ total: count() })
    .from(venueSuggestions)
    .where(gte(venueSuggestions.createdAt, new Date(now - 24 * 60 * 60 * 1000)));
  if (daily.total >= SUGGESTIONS_PER_DAY) return true;
  if (!hash) return false;

  const [recent] = await db
    .select({ total: count() })
    .from(venueSuggestions)
    .where(and(eq(venueSuggestions.senderHash, hash), gte(venueSuggestions.createdAt, new Date(now - 60 * 60 * 1000))));
  return recent.total >= SUGGESTIONS_PER_SENDER_PER_HOUR;
}

async function uniqueSlug(db: Database, name: string): Promise<string> {
  const base = slugify(name) || 'suggested-venue';
  for (let attempt = 1; attempt < 50; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base.slice(0, 115)}-${attempt}`;
    if (!(await isSlugTaken(db, candidate))) return candidate;
  }
  return `${base.slice(0, 100)}-${Date.now()}`;
}

/** Creates a hidden venue (no approved tier) from a suggestion and marks the suggestion accepted. */
export async function createDraftVenueFromSuggestion(db: Database, suggestion: SuggestionRow, userId: string) {
  const input = venueInputSchema.parse({
    name: suggestion.name,
    slug: await uniqueSlug(db, suggestion.name),
    tier: null,
    address: suggestion.address,
    cost: suggestion.cost ?? '££',
    cuisine: suggestion.cuisine,
    lunchSpecial: suggestion.recommendedOrder,
  });

  const [venue] = await db.insert(venues).values(venueValues(input, userId)).returning();
  await recordVenueRevision(db, venue, userId);
  await db
    .update(venueSuggestions)
    .set({ status: 'accepted', venueId: venue.id, reviewedAt: new Date(), reviewedBy: userId })
    .where(eq(venueSuggestions.id, suggestion.id));
  return venue;
}

export function serializeSuggestion(row: SuggestionRow) {
  const { senderHash: _senderHash, ...rest } = row;
  return {
    ...rest,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export type SerializedSuggestion = ReturnType<typeof serializeSuggestion>;
