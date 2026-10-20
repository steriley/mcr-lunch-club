/**
 * Replaces distance and walking time for every venue with coordinates using
 * ORS walking routes from HQ (the old values are straight-line estimates).
 *
 *   pnpm routes:backfill                 venues whose route has not come from ORS yet
 *   pnpm routes:backfill --dry-run       list what would be routed, no ORS calls, no writes
 *   pnpm routes:backfill --all           recompute every venue with coordinates
 *   pnpm routes:backfill --no-matrix     one Directions request per venue instead of Matrix batches
 *   pnpm routes:backfill --delay-ms=3000 pause between ORS requests (default 2000)
 *
 * Uses ORS Matrix (up to 25 venues per request), falling back to single
 * Directions requests for anything Matrix cannot route. Resumable: each venue
 * is saved as its route arrives and stamped with route_updated_at, so a rerun
 * skips finished venues. Stops straight away on a rate limit; rerun once the
 * ORS quota resets. Needs ORS_API_KEY. Check the ORS quota before pointing
 * this at production.
 */
import { closeDatabase, db } from '@/lib/db-script';
import { getOrsApiKey } from '@/lib/env';
import { backfillRoutes } from '@/lib/route-backfill';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const delayArg = args.find((arg) => arg.startsWith('--delay-ms='));

if (!dryRun && !getOrsApiKey()) {
  console.error('ORS_API_KEY is not set. Add it to .env.local (see .env.example).');
  process.exit(1);
}

const result = await backfillRoutes(db, {
  dryRun,
  all: args.includes('--all'),
  noMatrix: args.includes('--no-matrix'),
  delayMs: delayArg ? Math.max(0, Number(delayArg.split('=')[1]) || 0) : undefined,
  log: (line) => console.log(line),
});

const prefix = dryRun ? '[dry run] ' : '';
console.log(`${prefix}${result.todo} venue(s) needed a route.`);
let exitCode = 0;
if (result.stopped) {
  console.error(`Stopped: ${result.stopped}`);
  console.error(`${result.routed} routed this run, ${result.remaining} left. Rerun later to continue.`);
  exitCode = 2;
} else if (!dryRun) {
  console.log(`Done: ${result.routed} routed, ${result.failed.length} failed${result.failed.length ? ` (${result.failed.join(', ')}; rerun to retry them)` : ''}.`);
}
await closeDatabase();
process.exit(exitCode);
