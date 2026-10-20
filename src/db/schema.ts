import { boolean, date, decimal, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { CUISINE_VALUES } from '../lib/cuisines';
import { TIER_VALUES } from '../lib/tiers';

export const tierEnum = pgEnum('tier', TIER_VALUES);
export const cuisineEnum = pgEnum('cuisine', CUISINE_VALUES);

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // The last approved tier. NULL means no approved tier yet, so the venue is hidden.
  tier: tierEnum('tier'),
  address: text('address'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  pullQuote: text('pull_quote'),
  lunchSpecial: text('lunch_special'),
  websiteUrl: text('website_url'),
  imageUrl: text('image_url'),
  // Fields carried over from the original static content.
  cost: text('cost').notNull().default('££'),
  cuisine: cuisineEnum('cuisine').notNull().default('other'),
  distanceMiles: decimal('distance_miles', { precision: 5, scale: 2 }),
  walkingTimeMin: integer('walking_time_min'),
  // When distance/walking time last came from an ORS route; null for pending or pre-ORS estimates.
  routeUpdatedAt: timestamp('route_updated_at', { withTimezone: true }),
  lastInspectionDate: date('last_inspection_date'),
  mapSearchLink: text('map_search_link'),
  // Permanently closed (not a tier): set and cleared by any admin, logged in venue_events.
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closedBy: text('closed_by').references(() => user.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' })
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
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date())
});

export const venueRevisions = pgTable('venue_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  changedBy: text('changed_by'),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  snapshot: jsonb('snapshot').notNull()
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
    venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    actorId: text('actor_id').references(() => user.id, { onDelete: 'set null' }),
    actorName: text('actor_name'),
    detail: jsonb('detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('venue_events_venue_id_idx').on(table.venueId, table.createdAt)]
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
  reviewedBy: text('reviewed_by').references(() => user.id, { onDelete: 'set null' })
});

export type VenueRow = typeof venues.$inferSelect;
export type BriberyRow = typeof briberyRecords.$inferSelect;
export type SuggestionRow = typeof venueSuggestions.$inferSelect;
export type VenueEventRow = typeof venueEvents.$inferSelect;

export const schema = {
  venues,
  briberyRecords,
  venueRevisions,
  venueEvents,
  venueSuggestions
};
