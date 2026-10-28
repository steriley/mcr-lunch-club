/**
 * Imports the corrected last-inspection dates (drizzle/data/legacy-inspections.json)
 * as confirmed legacy inspections and rebuilds every venue's cached
 * last_inspection_date from confirmed inspections.
 *
 *   pnpm inspections:import-legacy --dry-run      show what would change, write nothing
 *   pnpm inspections:import-legacy                import
 *   pnpm inspections:import-legacy --keep-unlisted  leave venues that are not on the list alone
 *
 * By default venues NOT on the list lose their old (wrong) date, because the
 * owner said the stored dates are unreliable. Check the --dry-run output, and
 * confirm that default with the owner, before running it for real.
 * Aborts without writing if any listed name cannot be matched. Idempotent.
 */
import fs from 'node:fs';
import { closeDatabase, db } from '@/lib/db-script';
import {
  importLegacyInspections,
  UnmatchedVenuesError,
  type LegacyEntry,
} from '@/lib/legacy-inspections';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const keepUnlisted = args.has('--keep-unlisted');

const { inspections: entries } = JSON.parse(
  fs.readFileSync('drizzle/data/legacy-inspections.json', 'utf8')
) as { inspections: LegacyEntry[] };

let exitCode = 0;
try {
  const { plan, inserted, changedDates } = await importLegacyInspections(db, entries, {
    dryRun,
    keepUnlisted,
  });
  const prefix = dryRun ? '[dry run] ' : '';
  console.log(
    `${prefix}Matched ${plan.matched.length + plan.never.length} of ${entries.length} listed venues (${plan.never.length} never inspected).`
  );
  console.log(
    `${prefix}Legacy inspections ${dryRun ? 'to insert' : 'inserted'}: ${inserted} (already present rows are skipped).`
  );
  const cleared = changedDates.filter((change) => change.after === null);
  const updated = changedDates.filter((change) => change.after !== null);
  console.log(
    `${prefix}Last inspection date ${dryRun ? 'would change' : 'changed'} for ${updated.length} venue(s):`
  );
  for (const change of updated)
    console.log(`  ${change.name}: ${change.before ?? '—'} -> ${change.after}`);
  console.log(
    `${prefix}Last inspection date ${dryRun ? 'would be cleared' : 'cleared'} for ${cleared.length} venue(s)${keepUnlisted ? ' (listed as never inspected)' : ''}:`
  );
  for (const change of cleared) console.log(`  ${change.name} (was ${change.before})`);
} catch (error) {
  if (error instanceof UnmatchedVenuesError) {
    console.error(error.message);
    exitCode = 1;
  } else {
    throw error;
  }
} finally {
  await closeDatabase();
}
process.exit(exitCode);
