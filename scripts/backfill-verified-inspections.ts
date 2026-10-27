/**
 * Backfills dual-verified inspections from the Chairs' audit trail
 * (drizzle/data/verified-inspections-backfill.json) for venues with no
 * inspection date, and updates their cached last_inspection_date.
 *
 *   pnpm inspections:backfill-verified --dry-run   show what would change, write nothing
 *   pnpm inspections:backfill-verified             write
 *
 * Venues that already have a confirmed inspection are skipped, so a rerun
 * changes nothing. Aborts without writing if a venue or Chair cannot be found.
 * The public pages are prerendered: rebuild the site afterwards.
 */
import fs from 'node:fs';
import { closeDatabase, db } from '@/lib/db-script';
import { backfillVerifiedInspections, BackfillError, type BackfillChairs, type BackfillEntry } from '@/lib/inspection-backfill';

const dryRun = process.argv.slice(2).includes('--dry-run');

const { chairs, inspections: entries } = JSON.parse(fs.readFileSync('drizzle/data/verified-inspections-backfill.json', 'utf8')) as {
  chairs: BackfillChairs;
  inspections: BackfillEntry[];
};

let exitCode = 0;
try {
  const { inserted, skipped, changedDates } = await backfillVerifiedInspections(db, entries, chairs, { dryRun });
  const prefix = dryRun ? '[dry run] ' : '';
  console.log(`${prefix}Verified inspections ${dryRun ? 'to insert' : 'inserted'} (${chairs.first} and ${chairs.second}): ${inserted.length}`);
  for (const row of inserted) console.log(`  ${row.name}: ${row.date} ${row.outcome}`);
  console.log(`${prefix}Last inspection date ${dryRun ? 'would change' : 'changed'} for ${changedDates.length} venue(s):`);
  for (const change of changedDates) console.log(`  ${change.name}: ${change.before ?? '—'} -> ${change.after ?? '—'}`);
  console.log(`${prefix}Skipped ${skipped.length} venue(s) that already have a confirmed inspection:`);
  for (const venue of skipped) console.log(`  ${venue.name} (last inspected ${venue.lastInspectionDate ?? '—'})`);
} catch (error) {
  if (error instanceof BackfillError) {
    console.error(error.message);
    exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await closeDatabase();
}
process.exit(exitCode);
