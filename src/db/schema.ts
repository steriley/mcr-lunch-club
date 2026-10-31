import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { CUISINE_VALUES } from '../lib/cuisines';
import { GOLDEN_CUT_SIZE } from '../lib/golden-cut-schema';
import { TIER_VALUES } from '../lib/tiers';

export const tierEnum = pgEnum('tier', TIER_VALUES);
export const cuisineEnum = pgEnum('cuisine', CUISINE_VALUES);

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // The last approved tier. NULL means no approved tier yet, so the venue is hidden.
  // Only ever changed by approving a tier proposal (src/lib/tier-proposals.ts).
  tier: tierEnum('tier'),
  address: text('address'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  pullQuote: text('pull_quote'),
  lunchSpecial: text('lunch_special'),
  websiteUrl: text('website_url'),
  // Legacy single image link (#35). Copied into venue_images by migration 0013 and no longer read or written;
  // a later pull request drops the column once nothing deployed selects it.
  imageUrl: text('image_url'),
  // Fields carried over from the original static content.
  cost: text('cost').notNull().default('££'),
  cuisine: cuisineEnum('cuisine').notNull().default('other'),
  distanceMiles: decimal('distance_miles', { precision: 5, scale: 2 }),
  walkingTimeMin: integer('walking_time_min'),
  // When distance/walking time last came from an ORS route; null for pending or pre-ORS estimates.
  routeUpdatedAt: timestamp('route_updated_at', { withTimezone: true }),
  // Cached: the latest confirmed inspection (verified or legacy). Never edited by hand.
  lastInspectionDate: date('last_inspection_date'),
  mapSearchLink: text('map_search_link'),
  // Permanently closed (not a tier): set and cleared by any admin, logged in venue_events.
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: text('closed_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
});

export const briberyRecords = pgTable('bribery_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  venueNameText: text('venue_name_text'),
  incidentDate: date('incident_date'),
  description: text('description').notNull(),
  outcome: text('outcome'),
  // Fields carried over from the original Hall of Shame entries.
  title: text('title'),
  incidentTime: text('incident_time'),
  location: text('location'),
  peopleInvolved: text('people_involved').array().notNull().default([]),
  witnesses: text('witnesses').array().notNull().default([]),
  benefitOffered: text('benefit_offered'),
  value: text('value'),
  published: boolean('published').notNull().default(true),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const venueRevisions = pgTable('venue_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id')
    .notNull()
    .references(() => venues.id, { onDelete: 'cascade' }),
  changedBy: text('changed_by'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  snapshot: jsonb('snapshot').notNull(),
});

/**
 * Admin actions on a venue that are not plain field edits (closing,
 * reopening, ...), shown on its history page. `actor_name` is a snapshot so
 * entries survive the admin's account being deleted.
 */
export const venueEvents = pgTable(
  'venue_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('venue_events_venue_id_idx').on(table.venueId, table.createdAt)]
);

export const inspectionStatusEnum = pgEnum('inspection_status', ['pending', 'confirmed', 'lapsed']);
export const inspectionKindEnum = pgEnum('inspection_kind', ['verified', 'legacy']);
export const inspectionOutcomeEnum = pgEnum('inspection_outcome', ['satisfactory', 'below_par']);

/**
 * Inspections. A verified one needs two different admins to press "Visited
 * today" on the same Europe/London day; a first press nobody confirms lapses
 * at midnight. Legacy rows are dates imported from the Chairs' records and
 * never count as verified. Names are snapshots so history survives account
 * deletion. The first Chair's press sets the outcome and the cosigner
 * affirms it; legacy rows have none.
 */
export const inspections = pgTable(
  'inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    inspectionDate: date('inspection_date').notNull(),
    status: inspectionStatusEnum('status').notNull().default('pending'),
    kind: inspectionKindEnum('kind').notNull().default('verified'),
    outcome: inspectionOutcomeEnum('outcome'),
    firstAdminId: text('first_admin_id').references(() => user.id, { onDelete: 'set null' }),
    firstAdminName: text('first_admin_name'),
    secondAdminId: text('second_admin_id').references(() => user.id, { onDelete: 'set null' }),
    secondAdminName: text('second_admin_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (table) => [
    // At most one pending inspection per venue.
    uniqueIndex('inspections_one_pending_per_venue')
      .on(table.venueId)
      .where(sql`${table.status} = 'pending'`),
    // Keeps the legacy import idempotent.
    uniqueIndex('inspections_one_legacy_per_venue_date')
      .on(table.venueId, table.inspectionDate)
      .where(sql`${table.kind} = 'legacy'`),
    index('inspections_venue_date_idx').on(table.venueId, table.inspectionDate),
    // Backstop for the two-admin rule; ids may later be nulled when an account is deleted.
    check(
      'inspections_two_different_admins',
      sql`${table.firstAdminId} is null or ${table.secondAdminId} is null or ${table.firstAdminId} <> ${table.secondAdminId}`
    ),
    // Every verified inspection records how it went; legacy rows are dates only.
    check(
      'inspections_verified_has_outcome',
      sql`${table.kind} = 'legacy' or ${table.outcome} is not null`
    ),
  ]
);

export const tierProposalStatusEnum = pgEnum('tier_proposal_status', [
  'pending',
  'approved',
  'declined',
  'withdrawn',
  'superseded',
]);

/**
 * Tier changes are proposals that a different admin must approve before
 * venues.tier changes. Decline reasons are internal and never public. Names
 * are snapshots so history survives account deletion.
 */
export const tierProposals = pgTable(
  'tier_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    fromTier: tierEnum('from_tier'),
    proposedTier: tierEnum('proposed_tier').notNull(),
    proposedBy: text('proposed_by').references(() => user.id, { onDelete: 'set null' }),
    proposedByName: text('proposed_by_name'),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    status: tierProposalStatusEnum('status').notNull().default('pending'),
    decidedBy: text('decided_by').references(() => user.id, { onDelete: 'set null' }),
    decidedByName: text('decided_by_name'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    declineReason: text('decline_reason'),
    // The verified inspection that allowed a move into Approved.
    inspectionId: uuid('inspection_id').references(() => inspections.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('tier_proposals_one_pending_per_venue')
      .on(table.venueId)
      .where(sql`${table.status} = 'pending'`),
    index('tier_proposals_venue_idx').on(table.venueId, table.proposedAt),
    index('tier_proposals_status_idx').on(table.status, table.decidedAt),
    check(
      'tier_proposals_decline_reason',
      sql`${table.status} <> 'declined' or length(trim(${table.declineReason})) > 0`
    ),
    check(
      'tier_proposals_decider_not_proposer',
      sql`${table.proposedBy} is null or ${table.decidedBy} is null or ${table.status} not in ('approved', 'declined') or ${table.proposedBy} <> ${table.decidedBy}`
    ),
  ]
);

/**
 * The Golden Cut: up to five Approved venues the Chairs curate for the top
 * of the home page. Position 1 is the hero. The puff piece and anchor dish
 * are written for this display only; when blank the page falls back to the
 * venue's own lunch special.
 */
export const goldenCut = pgTable(
  'golden_cut',
  {
    venueId: uuid('venue_id')
      .primaryKey()
      .references(() => venues.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    puffPiece: text('puff_piece'),
    anchorDish: text('anchor_dish'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('golden_cut_position_idx').on(table.position),
    check(
      'golden_cut_position_range',
      sql`${table.position} between 1 and ${sql.raw(String(GOLDEN_CUT_SIZE))}`
    ),
  ]
);

/**
 * Venue photos (#35). Each has a full (~1600px) and a thumbnail (~640px) WebP
 * variant, both uncropped. Exactly one per venue is primary. The caption
 * doubles as alt text. Focal point is a percentage (centre when null). Rows
 * migrated from the old single image link (migration 0013) have no thumbnail, size or uploader.
 */
export const venueImages = pgTable(
  'venue_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    fullUrl: text('full_url').notNull(),
    // Null for migrated rows.
    thumbUrl: text('thumb_url'),
    // Of the full variant; null for migrated rows.
    width: integer('width'),
    height: integer('height'),
    caption: text('caption'),
    isPrimary: boolean('is_primary').notNull().default(false),
    focalX: smallint('focal_x'),
    focalY: smallint('focal_y'),
    uploadedBy: text('uploaded_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('venue_images_one_primary_per_venue')
      .on(table.venueId)
      .where(sql`${table.isPrimary}`),
    index('venue_images_venue_idx').on(table.venueId, table.createdAt),
    // Both or neither. The NOT NULL tests matter: with one side null the range test
    // is NULL, which a CHECK treats as passing.
    check(
      'venue_images_focal_range',
      sql`(${table.focalX} is null and ${table.focalY} is null) or (${table.focalX} is not null and ${table.focalY} is not null and ${table.focalX} between 0 and 100 and ${table.focalY} between 0 and 100)`
    ),
  ]
);

/**
 * A publishing admin action that has not reached the public site yet (#100).
 * The public pages are prerendered, so these wait for a production build; the
 * build's `publish:settle` step deletes the ones saved before it started.
 */
export const pendingPublishChanges = pgTable(
  'pending_publish_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The admin route's action label, e.g. "Update venue".
    action: text('action').notNull(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
    actorId: text('actor_id')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('pending_publish_changes_created_idx').on(table.createdAt)]
);

/** Each ask for a rebuild, and whether the Deploy Hook accepted it. Null requester: a cron. */
export const publishRequests = pgTable(
  'publish_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    requestedBy: text('requested_by').references(() => user.id),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    accepted: boolean('accepted').notNull(),
  },
  (table) => [
    check(
      'publish_requests_source_valid',
      sql`${table.source} in ('chair', 'auto', 'nightly', 'bulletin')`
    ),
  ]
);

/** A single row (id 1): when the last production build that settled the queue started. */
export const publishState = pgTable(
  'publish_state',
  {
    id: integer('id').primaryKey().default(1),
    lastPublishedAt: timestamp('last_published_at', { withTimezone: true }),
  },
  (table) => [check('publish_state_single_row', sql`${table.id} = 1`)]
);

export const suggestionStatusEnum = pgEnum('suggestion_status', ['new', 'accepted', 'dismissed']);

/** Venue suggestions sent in by members from the public "Suggest a Venue" form. */
export const venueSuggestions = pgTable('venue_suggestions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  cuisine: text('cuisine'),
  cost: text('cost'),
  recommendedOrder: text('recommended_order'),
  rationale: text('rationale').notNull(),
  submitterName: text('submitter_name'),
  status: suggestionStatusEnum('status').notNull().default('new'),
  // Draft venue created from this suggestion, if any.
  venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  // Keyed hash of the sender's IP, used only for rate limiting.
  senderHash: text('sender_hash'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
});

export type VenueRow = typeof venues.$inferSelect;
export type BriberyRow = typeof briberyRecords.$inferSelect;
export type SuggestionRow = typeof venueSuggestions.$inferSelect;
export type VenueEventRow = typeof venueEvents.$inferSelect;
export type InspectionRow = typeof inspections.$inferSelect;
export type TierProposalRow = typeof tierProposals.$inferSelect;
export type VenueImageRow = typeof venueImages.$inferSelect;
