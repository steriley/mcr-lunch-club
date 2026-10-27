/**
 * Backfills the Chairs' audit trail (drizzle/data/audit-trail-backfill.json):
 * dual-verified inspections for venues with no inspection date, the date
 * newly listed venues joined, and closures with their tier move.
 *
 *   pnpm venues:backfill-audit-trail --dry-run   show what would change, write nothing
 *   pnpm venues:backfill-audit-trail             write
 *
 * Anything already recorded is skipped, so a rerun changes nothing. Aborts
 * without writing if a venue or Chair cannot be found. The public pages are
 * prerendered: rebuild the site afterwards.
 */
import fs from 'node:fs';
import { closeDatabase, db } from '@/lib/db-script';
import { backfillAuditTrail, BackfillError, type BackfillData } from '@/lib/audit-trail-backfill';

const dryRun = process.argv.slice(2).includes('--dry-run');

const data = JSON.parse(fs.readFileSync('drizzle/data/audit-trail-backfill.json', 'utf8')) as BackfillData;

let exitCode = 0;
try {
  const result = await backfillAuditTrail(db, data, { dryRun });
  const prefix = dryRun ? '[dry run] ' : '';
  const would = (done: string, pending: string) => (dryRun ? pending : done);
  console.log(`${prefix}Verified inspections ${would('inserted', 'to insert')} (${data.chairs.first} and ${data.chairs.second}): ${result.inserted.length}`);
  for (const row of result.inserted) console.log(`  ${row.name}: ${row.date} ${row.outcome}`);
  console.log(`${prefix}Last inspection date ${would('changed', 'would change')} for ${result.changedDates.length} venue(s):`);
  for (const change of result.changedDates) console.log(`  ${change.name}: ${change.before ?? '—'} -> ${change.after ?? '—'}`);
  console.log(`${prefix}Skipped inspections for ${result.skipped.length} venue(s) that already have a confirmed one:`);
  for (const venue of result.skipped) console.log(`  ${venue.name} (last inspected ${venue.lastInspectionDate ?? '—'})`);
  console.log(`${prefix}Added date ${would('changed', 'would change')} for ${result.addedDates.length} venue(s):`);
  for (const change of result.addedDates) console.log(`  ${change.name}: ${change.before} -> ${change.after}`);
  console.log(`${prefix}${would('Closed', 'Would close')} ${result.closed.length} venue(s), with the tier move:`);
  for (const venue of result.closed) console.log(`  ${venue.name}: ${venue.date} ${venue.fromTier} -> ${venue.toTier}`);
  if (result.alreadyClosed.length) console.log(`${prefix}Already closed, left alone: ${result.alreadyClosed.join(', ')}`);
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
