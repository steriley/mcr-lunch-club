/**
 * Replaces distance and walking time for every venue with coordinates using
 * an ORS foot-walking route from HQ (the old values are straight-line
 * estimates).
 *
 *   pnpm routes:backfill                 venues whose route has not come from ORS yet
 *   pnpm routes:backfill --dry-run       list what would be looked up, no ORS calls, no writes
 *   pnpm routes:backfill --all           recompute every venue with coordinates
 *   pnpm routes:backfill --delay-ms=3000 pause between ORS calls (default 2000)
 *
 * Resumable: each venue is saved as soon as its route arrives and stamped
 * with route_updated_at, so a rerun skips finished venues. On HTTP 429 it
 * stops straight away; rerun once the ORS quota resets. Needs ORS_API_KEY.
 * Do not point this at production without checking the ORS quota first.
 */
import { and, asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { venues } from '@/db/schema';
import { closeDatabase, db } from '@/lib/db-script';
import { getOrsApiKey } from '@/lib/env';
import { OrsError, routeToVenueValues, walkingRouteFromBase } from '@/lib/ors';
import { recordVenueRevision } from '@/lib/venues';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const all = args.includes('--all');
const delayArg = args.find((arg) => arg.startsWith('--delay-ms='));
const delayMs = delayArg ? Math.max(0, Number(delayArg.split('=')[1]) || 0) : 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

if (!dryRun && !getOrsApiKey()) {
  console.error('ORS_API_KEY is not set. Add it to .env.local (see .env.example).');
  process.exit(1);
}

const hasCoordinates = and(isNotNull(venues.latitude), isNotNull(venues.longitude));
const todo = await db
  .select({ id: venues.id, name: venues.name, latitude: venues.latitude, longitude: venues.longitude })
  .from(venues)
  .where(all ? hasCoordinates : and(hasCoordinates, isNull(venues.routeUpdatedAt)))
  .orderBy(asc(venues.name));

console.log(`${dryRun ? '[dry run] ' : ''}${todo.length} venue(s) to route${all ? ' (--all)' : ''}.`);

let done = 0;
let failed = 0;
let exitCode = 0;

for (const [index, venue] of todo.entries()) {
  if (dryRun) {
    console.log(`  would route ${venue.name}`);
    continue;
  }
  if (index > 0 && delayMs) await sleep(delayMs);

  try {
    const route = routeToVenueValues(await walkingRouteFromBase({ lat: Number(venue.latitude), lng: Number(venue.longitude) }));
    const [row] = await db
      .update(venues)
      .set({ distanceMiles: route.distanceMiles.toFixed(2), walkingTimeMin: route.walkingTimeMin, routeUpdatedAt: new Date() })
      .where(eq(venues.id, venue.id))
      .returning();
    if (row) await recordVenueRevision(db, row, null);
    done += 1;
    console.log(`  ${venue.name}: ${route.distanceMiles.toFixed(2)} mi, ${route.walkingTimeMin} min`);
  } catch (error) {
    if (error instanceof OrsError && (error.kind === 'rate_limited' || error.kind === 'not_configured')) {
      console.error(`Stopped at ${venue.name}: ${error.message}`);
      console.error(`${done} routed this run, ${todo.length - index} left. Rerun later to continue.`);
      exitCode = 2;
      break;
    }
    failed += 1;
    console.error(`  ${venue.name}: ${error instanceof Error ? error.message : 'failed'} (left pending)`);
  }
}

if (!dryRun && exitCode === 0) {
  console.log(`Done: ${done} routed, ${failed} failed (rerun to retry them).`);
}
await closeDatabase();
process.exit(exitCode);
