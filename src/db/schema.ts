import { boolean, decimal, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tierEnum = pgEnum('tier', [
  'approved',
  'under_consideration',
  'to_be_assessed',
  'rejected',
  'if_we_must',
  'gone_but_not_forgotten'
]);

export const venues = pgTable('venues', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tier: tierEnum('tier').notNull(),
  address: text('address'),
  latitude: decimal('latitude', { precision: 8, scale: 5 }),
  longitude: decimal('longitude', { precision: 8, scale: 5 }),
  summary: text('summary'),
  verdict: text('verdict'),
  pullQuote: text('pull_quote'),
  lunchSpecial: text('lunch_special'),
  websiteUrl: text('website_url'),
  imageUrl: text('image_url'),
  published: boolean('published').notNull().default(false),
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  updatedBy: text('updated_by')
});

export const briberyRecords = pgTable('bribery_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  venueNameText: text('venue_name_text'),
  incidentDate: timestamp('incident_date', { mode: 'date', withTimezone: true }),
  description: text('description').notNull(),
  outcome: text('outcome'),
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

export const schema = {
  venues,
  briberyRecords,
  venueRevisions
};
