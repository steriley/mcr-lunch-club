import { and, asc, eq, ilike, not, or, type SQL } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { adminRoute, isUniqueViolation, jsonError, jsonResponse, slugTaken } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { parseTier } from '@/lib/tiers';
import { PROPOSAL_ERROR_MESSAGES, PROPOSAL_ERROR_STATUS } from '@/lib/tier-proposals';
import { markSuggestionAccepted, SUGGESTION_PROPOSED_TIER } from '@/lib/suggestions';
import { createVenueWithProposal, ProposalFailed, SuggestionUnavailable } from '@/lib/venue-create';
import { venueCreateSchema } from '@/lib/venue-schema';
import { resolveRoute, routeWarning } from '@/lib/venue-route';
import { isSlugTaken, serializeVenue } from '@/lib/venues';
import { publicVenueCondition } from '@/lib/visibility';

export const prerender = false;

export const GET = adminRoute({ action: 'List venues' }, async ({ url }) => {
  const conditions: SQL[] = [];
  const query = url.searchParams.get('query')?.trim();
  const tier = parseTier(url.searchParams.get('tier'));
  const status = url.searchParams.get('status');

  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
    conditions.push(or(ilike(venues.name, pattern), ilike(venues.slug, pattern))!);
  }
  if (tier) conditions.push(eq(venues.tier, tier));
  if (status === 'public') conditions.push(publicVenueCondition());
  if (status === 'hidden') conditions.push(not(publicVenueCondition()));

  const rows = await db
    .select()
    .from(venues)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(venues.name));

  return jsonResponse({ venues: rows.map(serializeVenue) });
});

function createVenueFailure(error: unknown): Response | undefined {
  if (error instanceof SuggestionUnavailable) {
    return jsonError(409, 'That suggestion has already been accepted or dismissed, or no longer exists. Nothing was saved.');
  }
  if (error instanceof ProposalFailed) {
    return jsonError(PROPOSAL_ERROR_STATUS[error.error], PROPOSAL_ERROR_MESSAGES[error.error], { proposedTier: PROPOSAL_ERROR_MESSAGES[error.error] });
  }
  if (isUniqueViolation(error)) return slugTaken();
  return undefined;
}

export const POST = adminRoute(
  { action: 'Create venue', body: venueCreateSchema, onError: createVenueFailure },
  async ({ body, actor }) => {
    if (await isSlugTaken(db, body.slug)) return slugTaken();

    // ORS failures never block the save; the route stays pending instead. Looked up before the transaction.
    const route = await resolveRoute(body, null);
    // The venue starts hidden (no approved tier); its tier is a proposal for a different admin to approve.
    const { proposedTier, fromSuggestion, ...input } = body;
    const { venue, proposal } = fromSuggestion
      ? // Accepting a suggestion: always To Be Assessed, and the suggestion is marked accepted in the same transaction.
        await createVenueWithProposal(db, input, SUGGESTION_PROPOSED_TIER, actor, route, async (tx, created) => {
          if (!(await markSuggestionAccepted(tx, fromSuggestion, created.id, actor.id))) throw new SuggestionUnavailable();
        })
      : await createVenueWithProposal(db, input, proposedTier, actor, route);
    return jsonResponse({ venue: serializeVenue(venue), proposalId: proposal?.id ?? null, routeWarning: routeWarning(route) }, 201);
  }
);
