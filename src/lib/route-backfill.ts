import { and, asc, isNotNull, isNull } from 'drizzle-orm';
import { venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { MATRIX_BATCH_SIZE, OrsError, routeToVenueValues, walkingMatrixFromBase, walkingRouteFromBase, type LatLng, type WalkingRoute } from '@/lib/ors';
import { routeColumns, updateVenue } from '@/lib/venues';

/**
 * Replaces the stored distance and walking time of venues with coordinates
 * using ORS walking routes from HQ. Matrix requests cover up to
 * MATRIX_BATCH_SIZE venues at a time; any venue the Matrix cannot route (or
 * a whole batch, if a Matrix request fails) falls back to one Directions
 * request each. Each venue is saved as soon as its route arrives and stamped
 * with route_updated_at, so a rerun only does what is left. A rate limit or
 * missing key stops the run straight away.
 */

export interface BackfillOptions {
  /** Recompute venues that already have an ORS route. */
  all?: boolean;
  dryRun?: boolean;
  /** Skip Matrix and use one Directions request per venue. */
  noMatrix?: boolean;
  /** Pause between ORS requests (free plan: 40 directions a minute). */
  delayMs?: number;
  matrix?: (destinations: LatLng[]) => Promise<(WalkingRoute | null)[]>;
  route?: (to: LatLng) => Promise<WalkingRoute>;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface BackfillResult {
  todo: number;
  routed: number;
  failed: string[];
  /** Set when the run stopped early (rate limited / not configured). */
  stopped: string | null;
  remaining: number;
}

export async function backfillRoutes(db: Database, options: BackfillOptions = {}): Promise<BackfillResult> {
  const matrix = options.matrix ?? ((destinations: LatLng[]) => walkingMatrixFromBase(destinations));
  const route = options.route ?? ((to: LatLng) => walkingRouteFromBase(to));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? (() => {});
  const delayMs = options.delayMs ?? 2000;

  const hasCoordinates = and(isNotNull(venues.latitude), isNotNull(venues.longitude));
  const todo = await db
    .select({ id: venues.id, name: venues.name, latitude: venues.latitude, longitude: venues.longitude })
    .from(venues)
    .where(options.all ? hasCoordinates : and(hasCoordinates, isNull(venues.routeUpdatedAt)))
    .orderBy(asc(venues.name));

  const result: BackfillResult = { todo: todo.length, routed: 0, failed: [], stopped: null, remaining: todo.length };
  if (options.dryRun) {
    for (const venue of todo) log(`  would route ${venue.name}`);
    return result;
  }

  let requests = 0;
  const pace = async () => {
    if (requests > 0 && delayMs) await sleep(delayMs);
    requests += 1;
  };

  const save = async (venue: (typeof todo)[number], walk: WalkingRoute) => {
    const values = routeToVenueValues(walk);
    // A script's change: no Chair is stamped as the editor.
    await updateVenue(db, venue.id, routeColumns({ ...values, routeUpdatedAt: new Date() }), null);
    result.routed += 1;
    result.remaining -= 1;
    log(`  ${venue.name}: ${values.distanceMiles.toFixed(2)} mi, ${values.walkingTimeMin} min`);
  };

  const stopsRun = (error: unknown) => error instanceof OrsError && (error.kind === 'rate_limited' || error.kind === 'not_configured');
  const point = (venue: (typeof todo)[number]): LatLng => ({ lat: Number(venue.latitude), lng: Number(venue.longitude) });

  for (let start = 0; start < todo.length; start += MATRIX_BATCH_SIZE) {
    const batch = todo.slice(start, start + MATRIX_BATCH_SIZE);
    let walks: (WalkingRoute | null)[] = batch.map(() => null);

    if (!options.noMatrix) {
      try {
        await pace();
        walks = await matrix(batch.map(point));
      } catch (error) {
        if (stopsRun(error)) {
          result.stopped = (error as OrsError).message;
          return result;
        }
        log(`  Matrix request failed (${error instanceof Error ? error.message : 'unknown error'}); routing this batch one by one.`);
      }
    }

    for (const [index, venue] of batch.entries()) {
      const fromMatrix = walks[index];
      if (fromMatrix) {
        await save(venue, fromMatrix);
        continue;
      }
      try {
        await pace();
        await save(venue, await route(point(venue)));
      } catch (error) {
        if (stopsRun(error)) {
          result.stopped = `${(error as OrsError).message} (stopped at ${venue.name})`;
          return result;
        }
        result.failed.push(venue.name);
        log(`  ${venue.name}: ${error instanceof Error ? error.message : 'failed'} (left as it is)`);
      }
    }
  }
  result.remaining = result.failed.length;
  return result;
}
