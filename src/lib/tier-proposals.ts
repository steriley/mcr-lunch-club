import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { tierProposals, venues, type TierProposalRow, type VenueRow } from '@/db/schema';
import type { Database, Tx } from '@/lib/db-client';
import { latestVerifiedInspection } from '@/lib/inspections';
import { isActiveChair } from '@/lib/roles';
import { tierLabel, type TierValue } from '@/lib/tiers';
import { actorName, type Actor } from '@/lib/venue-events';
import { updateVenue } from '@/lib/venues';

/**
 * Tier changes with two-admin integrity.
 *
 * Every tier change, including a new venue's first tier, is a proposal. A
 * different admin must approve it before venues.tier changes; until then the
 * public site keeps the last approved tier (or hides a new venue). Declining
 * needs a reason, which stays internal. One pending proposal per venue: only
 * its proposer can withdraw or replace it; other admins approve or decline.
 * Moving into Approved needs a dual-verified inspection. There is no
 * override: with a single active admin nothing can be approved.
 *
 * Banned admins are refused before they get here (requireAdmin). If a
 * proposer is later banned or deleted, the proposal stands and any other
 * admin can decide it.
 */

export const DECLINE_REASON_MAX = 1000;

export type ProposalError =
  | 'venue_not_found'
  | 'proposal_not_found'
  | 'same_as_current'
  | 'same_as_pending'
  | 'pending_by_other'
  | 'needs_verified_inspection'
  | 'not_pending'
  | 'own_proposal'
  | 'not_proposer'
  | 'reason_required';

export const PROPOSAL_ERROR_MESSAGES: Record<ProposalError, string> = {
  venue_not_found: 'Venue not found.',
  proposal_not_found: 'Proposal not found.',
  same_as_current: 'That is already the venue’s approved verdict.',
  same_as_pending: 'That verdict change is already waiting for approval.',
  pending_by_other: 'Another admin’s verdict proposal is already pending for this venue. Approve or decline it first.',
  needs_verified_inspection:
    'Moving a venue into Approved needs a dual-verified inspection first: two Chairs press “Visited today” on the same day. Imported legacy dates do not count.',
  not_pending: 'This proposal has already been decided or withdrawn.',
  own_proposal: 'You proposed this change, so a different admin must approve or decline it.',
  not_proposer: 'Only the admin who proposed this change can withdraw it.',
  reason_required: 'Give a reason for declining. It is kept internal and never shown publicly.',
};

export const PROPOSAL_ERROR_STATUS: Record<ProposalError, number> = {
  venue_not_found: 404,
  proposal_not_found: 404,
  same_as_current: 409,
  same_as_pending: 409,
  pending_by_other: 409,
  needs_verified_inspection: 409,
  not_pending: 409,
  own_proposal: 403,
  not_proposer: 403,
  reason_required: 400,
};

export type ProposalResult<T> = { ok: true; value: T } | { ok: false; error: ProposalError };

const fail = (error: ProposalError) => ({ ok: false as const, error });

async function lockVenue(tx: Tx, venueId: string): Promise<VenueRow | null> {
  const [venue] = await tx.select().from(venues).where(eq(venues.id, venueId)).for('update').limit(1);
  return venue ?? null;
}

async function pendingFor(tx: Tx, venueId: string): Promise<TierProposalRow | null> {
  const [pending] = await tx
    .select()
    .from(tierProposals)
    .where(and(eq(tierProposals.venueId, venueId), eq(tierProposals.status, 'pending')))
    .for('update')
    .limit(1);
  return pending ?? null;
}

/**
 * Inserts a pending proposal inside an existing transaction. Used when
 * proposing on an existing venue, and when creating a venue (or accepting a
 * suggestion) together with its first proposal.
 */
export async function proposeTierInTx(
  tx: Tx,
  venueId: string,
  proposedTier: TierValue,
  actor: Actor,
  now: Date = new Date()
): Promise<ProposalResult<TierProposalRow>> {
  const venue = await lockVenue(tx, venueId);
  if (!venue) return fail('venue_not_found');
  if (venue.tier === proposedTier) return fail('same_as_current');

  const pending = await pendingFor(tx, venueId);
  if (pending) {
    if (pending.proposedBy !== actor.id) return fail('pending_by_other');
    if (pending.proposedTier === proposedTier) return fail('same_as_pending');
  }

  let inspectionId: string | null = null;
  if (proposedTier === 'approved') {
    const inspection = await latestVerifiedInspection(tx, venueId);
    if (!inspection) return fail('needs_verified_inspection');
    inspectionId = inspection.id;
  }

  if (pending) {
    // The proposer replaces their own pending proposal.
    await tx
      .update(tierProposals)
      .set({ status: 'superseded', decidedAt: now })
      .where(and(eq(tierProposals.id, pending.id), eq(tierProposals.status, 'pending')));
  }

  const [proposal] = await tx
    .insert(tierProposals)
    .values({
      venueId,
      fromTier: venue.tier,
      proposedTier,
      proposedBy: actor.id,
      proposedByName: actorName(actor),
      proposedAt: now,
      status: 'pending',
      inspectionId,
    })
    .returning();
  return { ok: true, value: proposal };
}

export function proposeTier(db: Database, venueId: string, proposedTier: TierValue, actor: Actor, now?: Date) {
  return db.transaction((tx) => proposeTierInTx(tx, venueId, proposedTier, actor, now));
}

async function lockProposal(tx: Tx, proposalId: string): Promise<TierProposalRow | null> {
  const [proposal] = await tx.select().from(tierProposals).where(eq(tierProposals.id, proposalId)).for('update').limit(1);
  return proposal ?? null;
}

/** Approve: sets venues.tier. Only a pending proposal, only by someone other than the proposer. */
export function approveProposal(db: Database, proposalId: string, actor: Actor, now: Date = new Date()): Promise<ProposalResult<TierProposalRow>> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);
    if (!proposal) return fail('proposal_not_found');
    if (proposal.status !== 'pending') return fail('not_pending');
    if (proposal.proposedBy === actor.id) return fail('own_proposal');

    const [decided] = await tx
      .update(tierProposals)
      .set({ status: 'approved', decidedBy: actor.id, decidedByName: actorName(actor), decidedAt: now })
      .where(and(eq(tierProposals.id, proposalId), eq(tierProposals.status, 'pending')))
      .returning();
    if (!decided) return fail('not_pending');

    await updateVenue(tx, proposal.venueId, { tier: proposal.proposedTier }, actor, now);
    return { ok: true, value: decided };
  });
}

export function declineProposal(
  db: Database,
  proposalId: string,
  actor: Actor,
  reason: string,
  now: Date = new Date()
): Promise<ProposalResult<TierProposalRow>> {
  const trimmed = reason.trim().slice(0, DECLINE_REASON_MAX);
  if (!trimmed) return Promise.resolve(fail('reason_required'));
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);
    if (!proposal) return fail('proposal_not_found');
    if (proposal.status !== 'pending') return fail('not_pending');
    if (proposal.proposedBy === actor.id) return fail('own_proposal');

    const [decided] = await tx
      .update(tierProposals)
      .set({ status: 'declined', decidedBy: actor.id, decidedByName: actorName(actor), decidedAt: now, declineReason: trimmed })
      .where(and(eq(tierProposals.id, proposalId), eq(tierProposals.status, 'pending')))
      .returning();
    return decided ? { ok: true, value: decided } : fail('not_pending');
  });
}

export function withdrawProposal(db: Database, proposalId: string, actor: Actor, now: Date = new Date()): Promise<ProposalResult<TierProposalRow>> {
  return db.transaction(async (tx) => {
    const proposal = await lockProposal(tx, proposalId);
    if (!proposal) return fail('proposal_not_found');
    if (proposal.status !== 'pending') return fail('not_pending');
    if (proposal.proposedBy !== actor.id) return fail('not_proposer');

    const [decided] = await tx
      .update(tierProposals)
      .set({ status: 'withdrawn', decidedAt: now })
      .where(and(eq(tierProposals.id, proposalId), eq(tierProposals.status, 'pending')))
      .returning();
    return decided ? { ok: true, value: decided } : fail('not_pending');
  });
}

/**
 * Chairs who can sign things off (see isActiveChair in src/lib/roles.ts).
 * Filtered in code, not SQL, so comma-separated roles and expired bans count
 * exactly as they do at sign-in. There are only ever a handful of accounts.
 */
export async function countActiveAdmins(db: Database, now: Date = new Date()): Promise<number> {
  const accounts = await db.select({ role: user.role, banned: user.banned, banExpires: user.banExpires }).from(user);
  return accounts.filter((account) => isActiveChair(account, now)).length;
}

export async function pendingProposalForVenue(db: Database, venueId: string): Promise<TierProposalRow | null> {
  const [row] = await db
    .select()
    .from(tierProposals)
    .where(and(eq(tierProposals.venueId, venueId), eq(tierProposals.status, 'pending')))
    .limit(1);
  return row ?? null;
}

export async function listVenueProposals(db: Database, venueId: string): Promise<TierProposalRow[]> {
  return db.select().from(tierProposals).where(eq(tierProposals.venueId, venueId)).orderBy(desc(tierProposals.proposedAt)).limit(100);
}

export interface ProposalListItem extends TierProposalRow {
  venueName: string;
  venueSlug: string;
}

export async function listPendingProposals(db: Database): Promise<ProposalListItem[]> {
  const rows = await db
    .select({ proposal: tierProposals, venueName: venues.name, venueSlug: venues.slug })
    .from(tierProposals)
    .innerJoin(venues, eq(venues.id, tierProposals.venueId))
    .where(eq(tierProposals.status, 'pending'))
    .orderBy(tierProposals.proposedAt);
  return rows.map((row) => ({ ...row.proposal, venueName: row.venueName, venueSlug: row.venueSlug }));
}

export async function listRecentDecisions(db: Database, limit = 20): Promise<ProposalListItem[]> {
  const rows = await db
    .select({ proposal: tierProposals, venueName: venues.name, venueSlug: venues.slug })
    .from(tierProposals)
    .innerJoin(venues, eq(venues.id, tierProposals.venueId))
    .where(ne(tierProposals.status, 'pending'))
    .orderBy(sql`${tierProposals.decidedAt} desc nulls last`)
    .limit(limit);
  return rows.map((row) => ({ ...row.proposal, venueName: row.venueName, venueSlug: row.venueSlug }));
}

export const tierText = (tier: TierValue | null) => (tier ? tierLabel(tier) : 'No approved verdict');

/** History lines for one proposal: when it was made, and how it ended. */
export function describeProposal(proposal: TierProposalRow): { at: Date; text: string; note?: string }[] {
  const change = `${tierText(proposal.fromTier)} → ${tierText(proposal.proposedTier)}`;
  const lines: { at: Date; text: string; note?: string }[] = [
    { at: proposal.proposedAt, text: `Verdict change proposed (${change}) by ${proposal.proposedByName ?? 'a former admin'}` },
  ];
  if (proposal.decidedAt) {
    const by = proposal.decidedByName ?? 'a former admin';
    if (proposal.status === 'approved') lines.push({ at: proposal.decidedAt, text: `Verdict change approved (${change}) by ${by}` });
    if (proposal.status === 'declined')
      lines.push({ at: proposal.decidedAt, text: `Verdict change declined (${change}) by ${by}`, note: proposal.declineReason ?? undefined });
    if (proposal.status === 'withdrawn') lines.push({ at: proposal.decidedAt, text: `Verdict change withdrawn (${change}) by ${proposal.proposedByName ?? 'its proposer'}` });
    if (proposal.status === 'superseded') lines.push({ at: proposal.decidedAt, text: `Verdict change replaced by a newer proposal (${change})` });
  }
  return lines;
}

/** JSON-safe proposal for admin islands. Admin-only: it carries decline reasons. */
export function serializeProposal(proposal: TierProposalRow) {
  return {
    id: proposal.id,
    venueId: proposal.venueId,
    fromTier: proposal.fromTier,
    proposedTier: proposal.proposedTier,
    proposedBy: proposal.proposedBy,
    proposedByName: proposal.proposedByName,
    proposedAt: proposal.proposedAt.toISOString(),
    status: proposal.status,
    decidedByName: proposal.decidedByName,
    decidedAt: proposal.decidedAt?.toISOString() ?? null,
    declineReason: proposal.declineReason,
  };
}

export type SerializedProposal = ReturnType<typeof serializeProposal>;
