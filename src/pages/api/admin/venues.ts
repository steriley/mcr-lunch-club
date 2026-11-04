import { adminRoute, ERROR_HTTP, type ErrorHttp } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { mapOutcome } from '@/lib/outcome';
import { notifyChairs } from '@/lib/push/dispatch';
import { proposalEvent } from '@/lib/push/messages';
import { PROPOSAL_ERRORS } from '@/lib/tier-proposals';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { venueCreateSchema } from '@/lib/venue-schema';
import { routeWarning } from '@/lib/walking-route';
import { serializeVenue } from '@/lib/venues';

export const prerender = false;

/** A refused first verdict points the form at the verdict field. */
const proposalErrors = Object.fromEntries(
  PROPOSAL_ERRORS.map((code): [string, ErrorHttp] => [
    code,
    { ...ERROR_HTTP[code], fields: { proposedTier: ERROR_HTTP[code].message } },
  ])
);

export const POST = adminRoute(
  { action: 'Create venue', status: 201, body: venueCreateSchema, errors: proposalErrors },
  async ({ body, actor }) => {
    const { proposedTier, fromSuggestion, ...input } = body;
    const created = await venueLifecycle.createVenue(
      db,
      input,
      { proposedTier, fromSuggestion },
      actor
    );
    if (created.ok && created.value.proposal) notifyChairs(proposalEvent(created.value.proposal));
    return mapOutcome(created, ({ venue, proposal, route }) => ({
      venue: serializeVenue(venue),
      proposalId: proposal?.id ?? null,
      routeWarning: routeWarning(route),
    }));
  }
);
