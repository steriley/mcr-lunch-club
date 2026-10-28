/**
 * Imports the existing static content (src/data/venues.json and
 * src/data/incidents.json) into the database.
 *
 *   pnpm db:import            insert anything missing; existing rows are left alone
 *   pnpm db:import --dry-run  report what would happen without writing
 *   pnpm db:import --update   also overwrite existing venues' details with the file contents; tiers are kept
 *   pnpm db:import --update-tiers   as --update, and overwrite existing venues' tiers too
 *
 * Venues match on slug; bribery records match on title + incident date.
 * New venues are imported with their tier, so they are public as soon as they have coordinates.
 * Tiers otherwise change only through two-Chair proposals, which is why --update leaves them alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { briberyRecords } from '@/db/schema';
import { closeDatabase, db } from '@/lib/db-script';
import { importVenues, toImportableVenue, type LegacyVenue } from '@/lib/venue-import';
import type { Incident } from '@/types';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const updateTiers = args.has('--update-tiers');
const update = args.has('--update') || updateTiers;

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(relativePath), 'utf8')) as T;
}

const sourceVenues = readJson<LegacyVenue[]>('src/data/venues.json');
const sourceIncidents = readJson<Incident[]>('src/data/incidents.json');

// Validate everything before touching the database.
const items = sourceVenues.map(toImportableVenue);

const { inserted, updated, skipped } = await importVenues(db, items, {
  dryRun,
  update,
  updateTiers,
});

const verb = (past: string, future: string) => (dryRun ? future : past);

console.log(
  `${dryRun ? '[dry run] ' : ''}Venues (${items.length}): ${inserted} ${verb('inserted', 'would be inserted')}, ` +
    `${updated} ${verb('updated', 'would be updated')}, ${skipped} already present and left alone.`
);

let incidentsInserted = 0;
let incidentsSkipped = 0;

for (const incident of sourceIncidents) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(incident.date) ? incident.date : null;
  const [existing] = await db
    .select({ id: briberyRecords.id })
    .from(briberyRecords)
    .where(
      and(
        eq(briberyRecords.title, incident.title),
        date ? eq(briberyRecords.incidentDate, date) : isNull(briberyRecords.incidentDate)
      )
    )
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
