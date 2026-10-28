import { venues } from '@/db/schema';
import type { Database } from '@/lib/db-client';
import { mapLegacyCuisine } from '@/lib/cuisines';
import { parseTier, type TierValue } from '@/lib/tiers';
import { venueInputSchema, type VenueInput } from '@/lib/venue-schema';
import { recordVenueRevision, updateVenue, venueValues } from '@/lib/venues';
import type { Venue } from '@/types';

/** A venue as the old static JSON stored it, with the tier as a display label. */
export type LegacyVenue = Omit<Venue, 'tier'> & { status: string };

export interface ImportableVenue {
  input: VenueInput;
  tier: TierValue;
}

/**
 * Validates one legacy venue. The tier is returned beside the input, not inside it:
 * venueInputSchema deliberately has no tier, because a Chair edit can never set one.
 */
export function toImportableVenue(venue: LegacyVenue): ImportableVenue {
  const tier = parseTier(venue.status);
  if (!tier) throw new Error(`${venue.slug}: unknown tier "${venue.status}"`);

  const parsed = venueInputSchema.safeParse({
    name: venue.name,
    slug: venue.slug,
    address: venue.address,
    latitude: venue.lat,
    longitude: venue.lng,
    pullQuote: null,
    lunchSpecial: venue.eatLikeUs,
    websiteUrl: null,
    cost: venue.cost,
    cuisine: mapLegacyCuisine(venue.cuisine),
    mapSearchLink: venue.mapSearchLink,
  });

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`${venue.slug}: ${problems}`);
  }
  return { input: parsed.data, tier };
}

export interface VenueImportOptions {
  dryRun?: boolean;
  /** Overwrite existing venues' editable fields with the file contents. Never touches the tier. */
  update?: boolean;
  /** With `update`, also overwrite existing venues' tiers. Bypasses the two-Chair proposal rule, so it is opt-in. */
  updateTiers?: boolean;
}

export interface VenueImportResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export async function importVenues(
  db: Database,
  items: ImportableVenue[],
  options: VenueImportOptions = {}
): Promise<VenueImportResult> {
  const { dryRun = false, update = false, updateTiers = false } = options;
  const existing = new Map(
    (await db.select({ id: venues.id, slug: venues.slug }).from(venues)).map((row) => [
      row.slug,
      row.id,
    ])
  );
  const result: VenueImportResult = { inserted: 0, updated: 0, skipped: 0 };

  for (const { input, tier } of items) {
    const existingId = existing.get(input.slug);
    if (existingId && !update) {
      result.skipped += 1;
      continue;
    }
    if (dryRun) {
      if (existingId) result.updated += 1;
      else result.inserted += 1;
      continue;
    }

    // The import is not attributed to a Chair. Routes start pending; `pnpm routes:backfill` fills them from ORS.
    const values = venueValues(input, null, { distanceMiles: null, walkingTimeMin: null });
    if (existingId) {
      // Tiers change only through two-Chair proposals, so an update leaves them alone unless asked.
      await updateVenue(db, existingId, updateTiers ? { ...values, tier } : values, null);
      result.updated += 1;
    } else {
      // Deliberately outside venueValues/venueInputSchema: this is the bootstrap path that fills an empty
      // database from the legacy file, not a Chair edit. Without a tier a venue stays hidden (see visibility.ts).
      const [row] = await db
        .insert(venues)
        .values({ ...values, tier })
        .returning();
      await recordVenueRevision(db, row, null);
      result.inserted += 1;
    }
  }
  return result;
}
