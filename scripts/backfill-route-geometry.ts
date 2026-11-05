/**
 * Stores the route line drawn on each venue page: the walking path from HQ, or the driving path
 * for venues more than 30 minutes' walk away. Distance and walking time are not touched.
 *
 *   pnpm routes:geometry                 venues with coordinates and no line yet
 *   pnpm routes:geometry --dry-run       list what would be drawn, no ORS calls, no writes
 *   pnpm routes:geometry --all           redraw every venue with coordinates
 *   pnpm routes:geometry --delay-ms=3000 pause between ORS requests (default 2000)
 *
 * One Directions request per venue, plus one driving request for far venues. Resumable: a venue
 * is saved as its line arrives, so a rerun skips finished venues. Stops straight away on a rate
 * limit; rerun once the ORS quota resets. Needs ORS_API_KEY. Publish afterwards for the pages to
 * pick the lines up.
 */
import { closeDatabase, db, driver } from '@/lib/db-script';
import { getOrsApiKey } from '@/lib/env';
import { backfillRouteGeometry } from '@/lib/route-backfill';
import { guardScriptTarget } from '@/lib/script-guard';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const delayArg = args.find((arg) => arg.startsWith('--delay-ms='));

guardScriptTarget(args, { writes: !dryRun });

if (!dryRun && !getOrsApiKey()) {
  console.error('ORS_API_KEY is not set. Add it to .env.local (see .env.example).');
  process.exit(1);
}

const result = await backfillRouteGeometry(db, {
  dryRun,
  // neon-http cannot run a transaction.
  transactions: driver !== 'neon-http',
  all: args.includes('--all'),
  delayMs: delayArg ? Math.max(0, Number(delayArg.split('=')[1]) || 0) : undefined,
  log: (line) => console.log(line),
});

const prefix = dryRun ? '[dry run] ' : '';
console.log(`${prefix}${result.todo} venue(s) needed a route line.`);
let exitCode = 0;
if (result.stopped) {
  console.error(`Stopped: ${result.stopped}`);
  console.error(
    `${result.routed} drawn this run, ${result.remaining} left. Rerun later to continue.`
  );
  exitCode = 2;
} else if (!dryRun) {
  console.log(
    `Done: ${result.routed} drawn, ${result.failed.length} failed${result.failed.length ? ` (${result.failed.join(', ')}; rerun to retry them)` : ''}.`
  );
}
if (!dryRun && result.routed > 0) {
  console.log(
    "The public pages are prerendered: publish (Chairs' Area, or redeploy production) to show the change."
  );
}
await closeDatabase();
process.exit(exitCode);
