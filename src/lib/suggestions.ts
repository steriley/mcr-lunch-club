import { createHmac } from 'node:crypto';
import { and, count, eq, gte, isNull } from 'drizzle-orm';
import { venueSuggestions, type SuggestionRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { getAuthEnvironment } from '@/lib/env';
import { COST_BANDS, type CostBand } from '@/lib/venue-schema';

/** Per-sender limit for the public form. */
export const SUGGESTIONS_PER_SENDER_PER_HOUR = 3;
/** Site-wide ceiling so a flood can't bury the inbox. */
export const SUGGESTIONS_PER_DAY = 50;

/** Keyed hash of the sender's IP so the raw address is never stored. */
export function senderHash(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac('sha256', getAuthEnvironment().secret)
    .update(`suggestion:${ip}`)
    .digest('hex')
    .slice(0, 32);
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
    .where(
      and(
        eq(venueSuggestions.senderHash, hash),
        gte(venueSuggestions.createdAt, new Date(now - 60 * 60 * 1000))
      )
    );
  return recent.total >= SUGGESTIONS_PER_SENDER_PER_HOUR;
}

/** Accepting a suggestion always proposes this tier; a different admin must approve it. */
export const SUGGESTION_PROPOSED_TIER = 'to_be_assessed' as const;

/**
 * Marks a suggestion accepted and links it to the venue created from it.
 * Runs inside the venue-creation transaction; false when the suggestion is
 * gone or was already accepted or dismissed, so the caller can roll back.
 */
export async function markSuggestionAccepted(
  db: Pick<Database, 'update'>,
  suggestionId: string,
  venueId: string,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const rows = await db
    .update(venueSuggestions)
    .set({ status: 'accepted', venueId, reviewedAt: now, reviewedBy: userId })
    .where(
      and(
        eq(venueSuggestions.id, suggestionId),
        eq(venueSuggestions.status, 'new'),
        isNull(venueSuggestions.venueId)
      )
    )
    .returning({ id: venueSuggestions.id });
  return rows.length === 1;
}

/**
 * What the new-venue form may take from a suggestion. Only the name and a
 * valid cost band are copied into venue fields. The address only seeds the
 * location search, and cuisine, recommended order and rationale are shown
 * as read-only reference: a stranger's text is never trusted as coordinates,
 * cuisine or public copy.
 */
export function suggestionPrefill(suggestion: SuggestionRow) {
  return {
    id: suggestion.id,
    name: suggestion.name,
    cost: COST_BANDS.includes(suggestion.cost as CostBand) ? (suggestion.cost as CostBand) : null,
    searchQuery: suggestion.address,
    cuisineHint: suggestion.cuisine,
    recommendedOrder: suggestion.recommendedOrder,
    rationale: suggestion.rationale,
    submitterName: suggestion.submitterName,
  };
}

export type SuggestionPrefill = ReturnType<typeof suggestionPrefill>;

export function serializeSuggestion(row: SuggestionRow) {
  const { senderHash: _senderHash, ...rest } = row;
  return {
    ...rest,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export type SerializedSuggestion = ReturnType<typeof serializeSuggestion>;
