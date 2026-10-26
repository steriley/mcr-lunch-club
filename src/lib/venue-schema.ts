import { z } from 'zod';
import { CUISINE_VALUES, DEFAULT_CUISINE } from '@/lib/cuisines';
import { TIER_VALUES } from '@/lib/tiers';

/**
 * Venue input validation shared by the admin API and the Vue venue form.
 * Keep this module free of server-only imports so it can ship to the browser.
 */

export const COST_BANDS = ['£', '££', '£££'] as const;
export type CostBand = (typeof COST_BANDS)[number];

export const COST_BAND_LABELS: Record<CostBand, string> = {
  '£': '£ — under £10',
  '££': '££ — above £10',
  '£££': '£££ — payday treat',
};

const emptyToNull = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).nullable()
  );

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    const normalised = emptyToNull(value);
    if (normalised === null) return null;
    return typeof normalised === 'string' ? Number(normalised) : normalised;
  }, schema.nullable());

const optionalUrl = (label: string) =>
  z.preprocess(
    emptyToNull,
    z.url({ protocol: /^https?$/, error: `${label} must be a full http(s) link.` }).max(2000).nullable()
  );

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const venueFields = z.object({
  name: z.string().trim().min(2, 'Venue name is required.').max(200, 'Venue name must be 200 characters or fewer.'),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug is required.')
    .max(120, 'Slug must be 120 characters or fewer.')
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens only.'),
  address: optionalText(255, 'Address'),
  latitude: optionalNumber(
    z.number({ error: 'Latitude must be a number.' }).min(-90, 'Latitude must be between -90 and 90.').max(90, 'Latitude must be between -90 and 90.')
  ),
  longitude: optionalNumber(
    z.number({ error: 'Longitude must be a number.' }).min(-180, 'Longitude must be between -180 and 180.').max(180, 'Longitude must be between -180 and 180.')
  ),
  pullQuote: optionalText(400, 'Pull quote'),
  lunchSpecial: optionalText(1000, 'Lunch special'),
  websiteUrl: optionalUrl('Website URL'),
  cost: z.enum(COST_BANDS, { error: 'Choose a cost band.' }),
  cuisine: z.enum(CUISINE_VALUES, { error: 'Choose a cuisine from the list.' }).default(DEFAULT_CUISINE),
  mapSearchLink: optionalUrl('Map link'),
});

function checkLocation(venue: { latitude: number | null; longitude: number | null }, context: z.RefinementCtx) {
  // Coordinates come from an ORS search pick, or manual entry when search finds nothing.
  if ((venue.latitude === null) !== (venue.longitude === null)) {
    const field = venue.latitude === null ? 'latitude' : 'longitude';
    context.addIssue({ code: 'custom', path: [field], message: 'Enter both latitude and longitude, or neither.' });
  } else if (isOutsideUk(venue.latitude, venue.longitude)) {
    context.addIssue({ code: 'custom', path: ['latitude'], message: 'These coordinates are outside the UK. Check them, or search for the venue instead.' });
  }
}

/**
 * Editable venue fields. The tier is not one of them: it only changes when a
 * tier proposal is approved by a second admin (src/lib/tier-proposals.ts).
 */
export const venueInputSchema = venueFields.superRefine(checkLocation);

/**
 * A new venue, plus the tier to propose for it (it stays hidden until a
 * different admin approves). `fromSuggestion` accepts a member's suggestion:
 * that always proposes To Be Assessed and needs a real location.
 */
export const venueCreateSchema = venueFields
  .extend({
    proposedTier: z.preprocess(emptyToNull, z.enum(TIER_VALUES, { error: 'Choose a verdict.' }).nullable()).default(null),
    fromSuggestion: z.preprocess(emptyToNull, z.uuid({ error: 'Unknown suggestion.' }).nullable()).default(null),
  })
  .superRefine((venue, context) => {
    checkLocation(venue, context);
    if (venue.fromSuggestion && (venue.latitude === null || venue.longitude === null)) {
      context.addIssue({
        code: 'custom',
        path: ['latitude'],
        message: 'Pick the venue from the location search (or enter it manually) before accepting a suggestion.',
      });
    }
    if (venue.proposedTier === 'approved') {
      context.addIssue({
        code: 'custom',
        path: ['proposedTier'],
        message: 'A new venue cannot be proposed straight into Approved: it needs a dual-verified inspection first.',
      });
    }
  });

export type VenueInput = z.output<typeof venueInputSchema>;

/** Rough UK bounding box; venues outside it are rejected. */
export function isOutsideUk(latitude: number | null, longitude: number | null): boolean {
  if (latitude === null || longitude === null) return false;
  return latitude < 49.8 || latitude > 60.9 || longitude < -8.7 || longitude > 1.8;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}
