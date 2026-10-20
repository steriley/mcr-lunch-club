/**
 * Imports the existing static content (src/data/venues.json and
 * src/data/incidents.json) into the database.
 *
 *   pnpm db:import            insert anything missing; existing rows are left alone
 *   pnpm db:import --dry-run  report what would happen without writing
 *   pnpm db:import --update   also overwrite existing venues with the file contents
 *
 * Venues match on slug; bribery records match on title + incident date.
 * Venues are imported with their tier, so they are public as soon as they have coordinates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { briberyRecords, venues } from '@/db/schema';
import { closeDatabase, db } from '@/lib/db-script';
import { mapLegacyCuisine } from '@/lib/cuisines';
import { parseTier } from '@/lib/tiers';
import { venueInputSchema, type VenueInput } from '@/lib/venue-schema';
import { recordVenueRevision, venueValues } from '@/lib/venues';
import type { Incident, Venue } from '@/types';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const update = args.has('--update');

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8')) as T;
}

function toVenueInput(venue: Venue): VenueInput {
  const tier = parseTier(venue.status);
  if (!tier) throw new Error(`${venue.slug}: unknown tier "${venue.status}"`);

  const parsed = venueInputSchema.safeParse({
    name: venue.name,
    slug: venue.slug,
    tier,
    address: venue.address,
    latitude: venue.lat,
    longitude: venue.lng,
    pullQuote: null,
    lunchSpecial: venue.eatLikeUs,
    websiteUrl: null,
    imageUrl: null,
    cost: venue.cost,
    cuisine: mapLegacyCuisine(venue.cuisine),
    lastInspectionDate: /^\d{4}-\d{2}-\d{2}$/.test(venue.lastInspectionDate) ? venue.lastInspectionDate : null,
    mapSearchLink: venue.mapSearchLink,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`${venue.slug}: ${problems}`);
  }
  return parsed.data;
}

const sourceVenues = readJson<Venue[]>('src/data/venues.json');
const sourceIncidents = readJson<Incident[]>('src/data/incidents.json');

// Validate everything before touching the database.
const venueInputs = sourceVenues.map(toVenueInput);

const existingVenues = new Map(
  (await db.select({ id: venues.id, slug: venues.slug }).from(venues)).map((row) => [row.slug, row.id])
);

let inserted = 0;
let updated = 0;
let skipped = 0;

for (const input of venueInputs) {
  const existingId = existingVenues.get(input.slug);
  if (existingId && !update) {
    skipped += 1;
    continue;
  }
  if (dryRun) {
    existingId ? (updated += 1) : (inserted += 1);
    continue;
  }

  // The import is not attributed to a Chair. Routes start pending; `pnpm routes:backfill` fills them from ORS.
  const values = venueValues(input, null, { distanceMiles: null, walkingTimeMin: null });
  const [row] = existingId
    ? await db.update(venues).set(values).where(eq(venues.id, existingId)).returning()
    : await db.insert(venues).values(values).returning();
  await recordVenueRevision(db, row, null);
  existingId ? (updated += 1) : (inserted += 1);
}

const verb = (past: string, future: string) => (dryRun ? future : past);

console.log(
  `${dryRun ? '[dry run] ' : ''}Venues (${venueInputs.length}): ${inserted} ${verb('inserted', 'would be inserted')}, ` +
    `${updated} ${verb('updated', 'would be updated')}, ${skipped} already present and left alone.`
);

let incidentsInserted = 0;
let incidentsSkipped = 0;

for (const incident of sourceIncidents) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(incident.date) ? incident.date : null;
  const [existing] = await db
    .select({ id: briberyRecords.id })
    .from(briberyRecords)
    .where(and(eq(briberyRecords.title, incident.title), date ? eq(briberyRecords.incidentDate, date) : isNull(briberyRecords.incidentDate)))
    .limit(1);

  if (existing) {
    incidentsSkipped += 1;
    continue;
  }
  incidentsInserted += 1;
  if (dryRun) continue;

  await db.insert(briberyRecords).values({
    title: incident.title,
    incidentDate: date,
    incidentTime: incident.time ?? null,
    location: incident.location ?? null,
    peopleInvolved: incident.peopleInvolved,
    witnesses: incident.witnesses,
    benefitOffered: incident.benefitOffered,
    value: incident.value,
    description: incident.context,
    outcome: incident.outcome,
    published: true,
    createdBy: 'import',
  });
}

console.log(
  `${dryRun ? '[dry run] ' : ''}Bribery records (${sourceIncidents.length}): ${incidentsInserted} ${verb('inserted', 'would be inserted')}, ` +
    `${incidentsSkipped} already present and left alone.`
);

await closeDatabase();
