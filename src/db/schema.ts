import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  decimal,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { CONTACT_STATUSES, CONTACT_TOPICS } from '../lib/contact-schema';
import { CUISINE_VALUES } from '../lib/cuisines';
import { GOLDEN_CUT_SIZE } from '../lib/golden-cut-schema';
import {
  MEMBER_HOLD_REASONS,
  MEMBER_INSPECTION_STATUSES,
  MEMBER_COSTS,
  MEMBER_VERDICT_VOTES,
  MEMBER_VERIFICATIONS,
} from '../lib/member-inspection-display';
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
  // The route line drawn on the venue page: an ORS encoded polyline (precision 5) from HQ, plus the
  // mode it was routed in and the minutes in that mode. Null while pending; cleared when the location changes.
  routeGeometry: text('route_geometry'),
  routeMode: text('route_mode'),
  routeDurationMin: integer('route_duration_min'),
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

export const noteVisibilityEnum = pgEnum('note_visibility', ['internal', 'public']);

/**
 * A visit: one Chair at one venue on one Europe/London day. "Visited today"
 * creates (or links) the presser's visit; "Log a visit" records one with no
 * inspection. Kept apart from `inspections` because inspection rows feed the
 * public pages. Internal only: no public page reads this table.
 */
export const venueVisits = pgTable(
  'venue_visits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    visitDate: date('visit_date').notNull(),
    // Null for a standalone visit, or if the inspection is ever deleted.
    inspectionId: uuid('inspection_id').references(() => inspections.id, { onDelete: 'set null' }),
    visitorId: text('visitor_id').references(() => user.id, { onDelete: 'set null' }),
    visitorName: text('visitor_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One visit per Chair per venue per day; keeps the Visited today press idempotent.
    uniqueIndex('venue_visits_one_per_chair_day')
      .on(table.venueId, table.visitorId, table.visitDate)
      .where(sql`${table.visitorId} is not null`),
    index('venue_visits_venue_date_idx').on(table.venueId, table.visitDate),
    index('venue_visits_inspection_idx').on(table.inspectionId),
  ]
);

/**
 * Field notes: what a Chair wrote about their own visit. Authorship is the
 * visit's visitor (checked in src/lib/field-notes.ts). Every active Chair can
 * read every note. `visibility` is for a later public release; until then a
 * check constraint keeps every note internal.
 */
export const visitNotes = pgTable(
  'visit_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    visitId: uuid('visit_id')
      .notNull()
      .references(() => venueVisits.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    visibility: noteVisibilityEnum('visibility').notNull().default('internal'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
  },
  (table) => [
    index('visit_notes_visit_idx').on(table.visitId, table.createdAt),
    check('visit_notes_body_length', sql`char_length(trim(${table.body})) between 1 and 4000`),
    // V1 safety rail: nothing may be public until the public release lands.
    check('visit_notes_internal_only', sql`${table.visibility} = 'internal'`),
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
    // The venue's name when the change was recorded, so a deleted venue is still named.
    venueName: text('venue_name'),
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

export const contactTopicEnum = pgEnum('contact_topic', CONTACT_TOPICS);
export const contactStatusEnum = pgEnum('contact_status', CONTACT_STATUSES);

/**
 * Messages from the public contact form (#132). Chairs-only: no public page, component or
 * serializer reads this table (src/test/public-safety.test.ts); the public route only writes to it
 * through src/lib/contact-submit.ts. Both hashes are keyed HMACs: the sender's IP and the message
 * body are never used to identify anyone, only to rate-limit and drop repeats. Rows older than
 * CONTACT_RETENTION_DAYS are deleted daily (/api/cron/contact-retention).
 */
export const contactMessages = pgTable(
  'contact_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    topic: contactTopicEnum('topic').notNull(),
    message: text('message').notNull(),
    senderHash: text('sender_hash'),
    bodyHash: text('body_hash').notNull(),
    status: contactStatusEnum('status').notNull().default('new'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('contact_messages_created_idx').on(table.createdAt),
    index('contact_messages_sender_idx').on(table.senderHash, table.createdAt),
  ]
);

/**
 * A browser's Web Push subscription for a Chair (#115). One row per device, unique by endpoint: a
 * device that signs in as someone else moves to them. Deleting the user deletes their devices.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    // Derived in the browser for the device list, e.g. "iPhone · Home Screen". Nothing more identifying.
    userAgentLabel: text('user_agent_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    // Consecutive failed deliveries; reset by a success.
    failureCount: integer('failure_count').notNull().default(0),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)]
);

/**
 * Which pushes a Chair wants, account-wide. No row means the defaults (all on but suggestions and
 * contact messages). The timestamps throttle suggestion, contact and test pushes and remember the
 * dashboard prompt.
 */
export const notificationPreferences = pgTable('notification_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  proposals: boolean('proposals').notNull().default(true),
  decisions: boolean('decisions').notNull().default(true),
  visits: boolean('visits').notNull().default(true),
  suggestions: boolean('suggestions').notNull().default(false),
  suggestionsNotifiedAt: timestamp('suggestions_notified_at', { withTimezone: true }),
  contact: boolean('contact').notNull().default(false),
  contactNotifiedAt: timestamp('contact_notified_at', { withTimezone: true }),
  testSentAt: timestamp('test_sent_at', { withTimezone: true }),
  promptDismissedAt: timestamp('prompt_dismissed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * Member sign-in email requests (#136), kept only to rate-limit them: per email, per sender and
 * site-wide. Both hashes are keyed HMACs (src/lib/members/sign-in.ts); no address or IP is
 * stored. Rows older than two days are deleted as new requests arrive.
 */
export const memberSignInRequests = pgTable(
  'member_sign_in_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    emailHash: text('email_hash').notNull(),
    senderHash: text('sender_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('member_sign_in_requests_created_idx').on(table.createdAt),
    index('member_sign_in_requests_email_idx').on(table.emailHash, table.createdAt),
  ]
);

/**
 * Member accounts (#136, PR c). Members are Better Auth users with the `user` role; these tables
 * hold what the club adds to them.
 *
 * **Cascade rule:** every member-owned row references `user.id` with `on delete cascade`, so
 * deleting a member's account (src/lib/members/profiles.ts, `deleteMemberAccount`) removes all of
 * it, their `member_events` included. Nothing about a deleted member is kept, not even a ban or a
 * name a Chair hid: a member who deletes their account and signs up again starts afresh (#136,
 * "Decisions"). Tables added by later issues for member-owned data must follow the same rule.
 */

/**
 * One row per member, created when they first open their profile (or by the seed). The display
 * name is unique ignoring case and spacing (`display_name_key`, src/lib/members/display-name.ts),
 * and is shown publicly only while `show_publicly` is on and no Chair has hidden it.
 */
export const memberProfiles = pgTable(
  'member_profiles',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    displayName: text('display_name'),
    // The normalised name the uniqueness rule compares; set and cleared with display_name.
    displayNameKey: text('display_name_key').unique('member_profiles_display_name_key_unique'),
    showPublicly: boolean('show_publicly').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    // A Chair hid the current name. It is never shown publicly and stays taken
    // (member_reserved_names); the member may choose one new name.
    hiddenByChairAt: timestamp('hidden_by_chair_at', { withTimezone: true }),
    // The member used their one rename after a hide. If that name is hidden too, they can't set a
    // name until a Chair clears this.
    renamedAfterHideAt: timestamp('renamed_after_hide_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'member_profiles_name_and_key',
      sql`(${table.displayName} is null) = (${table.displayNameKey} is null)`
    ),
  ]
);

/**
 * Display names a Chair hid. They stay taken, by everyone including the member who had them, so
 * an offensive name can't be claimed again. Deleted with the member's account (cascade rule above).
 */
export const memberReservedNames = pgTable(
  'member_reserved_names',
  {
    nameKey: text('name_key').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    reservedAt: timestamp('reserved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('member_reserved_names_user_idx').on(table.userId)]
);

export const memberEventActionEnum = pgEnum('member_event_action', [
  'name_hidden',
  'name_allowed',
  'banned',
  'unbanned',
]);

/**
 * What the Chairs did to a member's account, for the Members list. `user_id` is the member and
 * cascades (rule above); `actor_id` is the Chair and is kept as null if the Chair's account goes.
 */
export const memberEvents = pgTable(
  'member_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    action: memberEventActionEnum('action').notNull(),
    // The hidden name, for a name_hidden event; nothing else is recorded.
    detail: text('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('member_events_user_idx').on(table.userId, table.createdAt)]
);

export const memberCostEnum = pgEnum('member_cost', MEMBER_COSTS);
export const memberVerdictVoteEnum = pgEnum('member_verdict_vote', MEMBER_VERDICT_VOTES);
export const memberInspectionVerificationEnum = pgEnum(
  'member_inspection_verification',
  MEMBER_VERIFICATIONS
);
export const memberInspectionStatusEnum = pgEnum(
  'member_inspection_status',
  MEMBER_INSPECTION_STATUSES
);
export const memberInspectionHoldReasonEnum = pgEnum(
  'member_inspection_hold_reason',
  MEMBER_HOLD_REASONS
);

/**
 * People's Inspections (#137): a member's log of one lunch. Deliberately apart from the Chairs'
 * `inspections`, which feed tiers; nothing here changes a venue's tier. Member-owned, so
 * `member_id` cascades (the rule above `memberProfiles`). The rules are in
 * src/lib/member-inspections.ts.
 *
 * - One per member per Europe/London day, across all venues: nobody eats two lunches a day.
 * - `verification` is `gps` when the browser put the member within 150 m of the venue when they
 *   saved it. Their position is never stored, only the result.
 * - `status`: `held` while the anti-gaming checks wait for a Chair; `removed` by a Chair, with a
 *   reason that stays internal. `held_reason` says which check held it.
 */
export const memberInspections = pgTable(
  'member_inspections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    memberId: text('member_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    visitDate: date('visit_date').notNull(),
    dish: text('dish').notNull(),
    cost: memberCostEnum('cost').notNull(),
    verdictVote: memberVerdictVoteEnum('verdict_vote').notNull(),
    pullQuote: text('pull_quote'),
    verifiedOnSite: boolean('verified_on_site').notNull().default(false),
    verification: memberInspectionVerificationEnum('verification').notNull().default('none'),
    status: memberInspectionStatusEnum('status').notNull().default('visible'),
    heldReason: memberInspectionHoldReasonEnum('held_reason'),
    // The Chair's review: approving a held log, or removing any log. Kept if the Chair's account goes.
    reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    // Why a Chair removed it. Internal: never shown publicly or sent in a notification.
    reviewReason: text('review_reason'),
    // A confirmed stuffing attempt this log was part of (the Hall of Shame).
    briberyRecordId: uuid('bribery_record_id').references(() => briberyRecords.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('member_inspections_one_per_member_day').on(table.memberId, table.visitDate),
    index('member_inspections_venue_idx').on(table.venueId, table.status, table.createdAt),
    index('member_inspections_member_venue_idx').on(table.memberId, table.venueId),
    index('member_inspections_held_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'held'`),
    check('member_inspections_dish_length', sql`char_length(${table.dish}) between 1 and 120`),
    check(
      'member_inspections_quote_length',
      sql`${table.pullQuote} is null or char_length(${table.pullQuote}) between 1 and 140`
    ),
    check(
      'member_inspections_verified_matches',
      sql`${table.verifiedOnSite} = (${table.verification} <> 'none')`
    ),
    check(
      'member_inspections_removal_reason',
      sql`${table.status} <> 'removed' or char_length(trim(${table.reviewReason})) > 0`
    ),
  ]
);

/**
 * The Swing-o-meter's stored aggregates (#138), one row per venue, recomputed in the same
 * transaction as every log write, edit, delete and moderation change (src/lib/public-scores.ts)
 * and daily by the cron (bans and account deletions). They hold everything the People's score
 * needs except the venue's tier, so a tier change needs no recompute: the score is finished at
 * read time against the current tier (src/lib/swing.ts). Nothing here identifies a member.
 */
export const venuePublicScores = pgTable('venue_public_scores', {
  venueId: uuid('venue_id')
    .primaryKey()
    .references(() => venues.id, { onDelete: 'cascade' }),
  eligibleMembers: integer('eligible_members').notNull().default(0),
  eligibleLogs: integer('eligible_logs').notNull().default(0),
  weightTotal: doublePrecision('weight_total').notNull().default(0),
  weightedSum: doublePrecision('weighted_sum').notNull().default(0),
  variance: doublePrecision('variance').notNull().default(0),
  approveCount: integer('approve_count').notNull().default(0),
  ifWeMustCount: integer('if_we_must_count').notNull().default(0),
  rejectCount: integer('reject_count').notNull().default(0),
  typicalCost: memberCostEnum('typical_cost'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One position per venue per London day, for the 90-day sparkline. Quorate days only. */
export const venuePublicScoreHistory = pgTable(
  'venue_public_score_history',
  {
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    position: smallint('position').notNull(),
    eligibleMembers: integer('eligible_members').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.venueId, table.day] }),
    check('venue_public_score_history_position', sql`${table.position} between 0 and 100`),
  ]
);

export type VenueRow = typeof venues.$inferSelect;
export type BriberyRow = typeof briberyRecords.$inferSelect;
export type SuggestionRow = typeof venueSuggestions.$inferSelect;
export type ContactMessageRow = typeof contactMessages.$inferSelect;
export type VenueEventRow = typeof venueEvents.$inferSelect;
export type InspectionRow = typeof inspections.$inferSelect;
export type VenueVisitRow = typeof venueVisits.$inferSelect;
export type VisitNoteRow = typeof visitNotes.$inferSelect;
export type TierProposalRow = typeof tierProposals.$inferSelect;
export type VenueImageRow = typeof venueImages.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NotificationPreferencesRow = typeof notificationPreferences.$inferSelect;
export type MemberProfileRow = typeof memberProfiles.$inferSelect;
export type MemberInspectionRow = typeof memberInspections.$inferSelect;
export type VenuePublicScoreRow = typeof venuePublicScores.$inferSelect;
