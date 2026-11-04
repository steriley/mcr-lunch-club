import {
  adminRoute,
  ERROR_HTTP,
  errorResponse,
  isUniqueViolation,
  jsonResponse,
  slugTaken,
} from '@/lib/admin-api';
import { db } from '@/lib/db';
import { notifyChairs } from '@/lib/push/dispatch';
import { proposalEvent } from '@/lib/push/messages';
import { markSuggestionAccepted, SUGGESTION_PROPOSED_TIER } from '@/lib/suggestions';
import { createVenueWithProposal, ProposalFailed, SuggestionUnavailable } from '@/lib/venue-create';
import { venueCreateSchema } from '@/lib/venue-schema';
import { resolveRoute, routeWarning } from '@/lib/walking-route';
import { isSlugTaken, serializeVenue } from '@/lib/venues';

export const prerender = false;

function createVenueFailure(error: unknown): Response | undefined {
  if (error instanceof SuggestionUnavailable) {
    return errorResponse('suggestion_unavailable');
  }
  if (error instanceof ProposalFailed) {
    return errorResponse(error.error, {
      [error.error]: {
        ...ERROR_HTTP[error.error],
        fields: { proposedTier: ERROR_HTTP[error.error].message },
      },
    });
  }
  if (isUniqueViolation(error)) return slugTaken();
  return undefined;
}

export const POST = adminRoute(
  {
    action: 'Create venue',

    body: venueCreateSchema,
    onError: createVenueFailure,
  },
  async ({ body, actor }) => {
    if (await isSlugTaken(db, body.slug)) return slugTaken();

    // ORS failures never block the save; the route stays pending instead. Looked up before the transaction.
    const route = await resolveRoute(body, null);
    // The venue starts hidden (no approved tier); its tier is a proposal for a different admin to approve.
    const { proposedTier, fromSuggestion, ...input } = body;
    const { venue, proposal } = fromSuggestion
      ? // Accepting a suggestion: always To Be Assessed, and the suggestion is marked accepted in the same transaction.
        await createVenueWithProposal(
          db,
          input,
          SUGGESTION_PROPOSED_TIER,
          actor,
          route,
          async (tx, created) => {
            if (!(await markSuggestionAccepted(tx, fromSuggestion, created.id, actor.id)))
              throw new SuggestionUnavailable();
          }
        )
      : await createVenueWithProposal(db, input, proposedTier, actor, route);
    if (proposal) notifyChairs(proposalEvent(proposal));
    return jsonResponse(
      {
        venue: serializeVenue(venue),
        proposalId: proposal?.id ?? null,
        routeWarning: routeWarning(route),
      },
      201
    );
  }
);
