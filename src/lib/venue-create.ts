import { venues, type TierProposalRow, type VenueRow } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { proposeTierInTx, type ProposalError } from '@/lib/tier-proposals';
import type { TierValue } from '@/lib/tiers';
import type { Actor } from '@/lib/venue-events';
import type { RouteValues } from '@/lib/venue-route';
import type { VenueInput } from '@/lib/venue-schema';
import { recordVenueRevision, venueValues } from '@/lib/venues';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export class ProposalFailed extends Error {
  constructor(readonly error: ProposalError) {
    super(error);
  }
}

/** Thrown inside the transaction when the suggestion being accepted is no longer available. */
export class SuggestionUnavailable extends Error {
  constructor() {
    super('Suggestion no longer available');
  }
}

/**
 * Creates a venue with no approved tier (hidden) and, when a tier is given,
 * its first pending proposal, in one transaction. `afterCreate` runs inside
 * the same transaction (e.g. marking a suggestion accepted).
 */
export async function createVenueWithProposal(
  db: Database,
  input: VenueInput,
  proposedTier: TierValue | null,
  actor: Actor,
  route: RouteValues,
  afterCreate?: (tx: Tx, venue: VenueRow) => Promise<void>
): Promise<{ venue: VenueRow; proposal: TierProposalRow | null }> {
  return db.transaction(async (tx) => {
    const [venue] = await tx.insert(venues).values(venueValues(input, actor.id, route)).returning();
    await recordVenueRevision(tx, venue, actor.id);

    let proposal: TierProposalRow | null = null;
    if (proposedTier) {
      const result = await proposeTierInTx(tx, venue.id, proposedTier, actor);
      if (!result.ok) throw new ProposalFailed(result.error);
      proposal = result.value;
    }
    if (afterCreate) await afterCreate(tx, venue);
    return { venue, proposal };
  });
}
