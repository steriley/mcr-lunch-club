import { boolean, date, decimal, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from './auth-schema';
import { TIER_VALUES } from '../lib/tiers';

export const tierEnum = pgEnum('tier', TIER_VALUES);

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tier: tierEnum('tier').notNull(),
  address: text('address'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  summary: text('summary'),
  verdict: text('verdict'),
  pullQuote: text('pull_quote'),
  lunchSpecial: text('lunch_special'),
  websiteUrl: text('website_url'),
  imageUrl: text('image_url'),
  // Fields carried over from the original static content.
  rank: integer('rank'),
  cost: text('cost').notNull().default('££'),
  cuisine: text('cuisine'),
  distanceMiles: decimal('distance_miles', { precision: 5, scale: 2 }),
  walkingTimeMin: integer('walking_time_min'),
  lastInspectionDate: date('last_inspection_date'),
  rejectionReason: text('rejection_reason'),
  mapSearchLink: text('map_search_link'),
  published: boolean('published').notNull().default(false),
  sortOrder: integer('sort_order').default(0),
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

export type VenueRow = typeof venues.$inferSelect;
export type BriberyRow = typeof briberyRecords.$inferSelect;

export const schema = {
  venues,
  briberyRecords,
  venueRevisions
};
