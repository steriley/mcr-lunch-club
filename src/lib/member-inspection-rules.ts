import '@/lib/zod-browser';
import { z } from 'zod';
import { haversineMetres, type LatLng } from '@/lib/map/ranking';
import { MEMBER_VERDICT_VOTES } from '@/lib/member-inspection-display';
import { CLOSED_BUT_LISTED_TIER, isMappable, type VisibilityFields } from '@/lib/visibility';

/**
 * People's Inspections (#137): the rules that need no database, so the log form checks the same
 * shape the server does and the tests can pin each rule down. Browser-safe. The profanity filter
 * is server-only (src/lib/members/display-name-filter.ts) and never ships to the browser; the
 * rules that need the database are in src/lib/member-inspections.ts; the stored values and their
 * labels, which the public venue page needs without Zod, are in src/lib/member-inspection-display.ts.
 */

export const DISH_MAX = 120;
export const PULL_QUOTE_MAX = 140;
const PRICE_MAX_PENCE = 10_000;
/** How far back a lunch can be logged: today and the six days before it (Europe/London). */
const LOG_DAYS_BACK = 6;
/** How long after saving a member may edit or delete a log. */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
/** On-site verification: the browser's position must be this close to the venue. */
const ON_SITE_METRES = 150;

// ---------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------

/** Trimmed, single-spaced, Unicode-normalised. */
const normaliseText = (raw: string) => raw.normalize('NFKC').trim().replace(/\s+/g, ' ');

const dishSchema = z
  .string({ error: 'Say what you ate.' })
  .transform(normaliseText)
  .pipe(
    z
      .string()
      .min(1, 'Say what you ate.')
      .max(DISH_MAX, `Keep the dish to ${DISH_MAX} characters or fewer.`)
  );

const pullQuoteSchema = z.preprocess(
  (value) => (typeof value === 'string' ? normaliseText(value) || null : (value ?? null)),
  z
    .string()
    .max(PULL_QUOTE_MAX, `Keep the quote to ${PULL_QUOTE_MAX} characters or fewer.`)
    .nullable()
);

const score = (label: string) =>
  z
    .number({ error: `Give ${label} from 1 to 5 stars.` })
    .int(`Give ${label} from 1 to 5 stars.`)
    .min(1, `Give ${label} from 1 to 5 stars.`)
    .max(5, `Give ${label} from 1 to 5 stars.`);

const priceSchema = z
  .number({ error: 'Use a price such as 8.50.' })
  .int('Use a price such as 8.50.')
  .min(0, 'Use a price such as 8.50.')
  .max(PRICE_MAX_PENCE, `Prices above £${PRICE_MAX_PENCE / 100} can’t be logged.`)
  .nullable()
  .default(null);

/** The browser's position when the member saved, used once for the on-site check and dropped. */
const positionSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .nullable()
  .default(null);

/** What a member can change after saving: everything but the venue, the day and the check. */
const editableFields = {
  dish: dishSchema,
  pricePaidPence: priceSchema,
  qualityScore: score('the food'),
  valueScore: score('value'),
  wouldReturn: z.boolean({ error: 'Say whether you’d go back.' }),
  verdictVote: z.enum(MEMBER_VERDICT_VOTES, { error: 'Choose a verdict.' }),
  pullQuote: pullQuoteSchema,
};

/** POST /api/member/inspections. */
export const memberInspectionInputSchema = z.object({
  venueId: z.uuid({ error: 'Choose a venue from the list.' }),
  visitDate: z.iso.date({ error: 'Choose the day you ate there.' }),
  ...editableFields,
  position: positionSchema,
});

/** PATCH /api/member/inspections/[id]. */
export const memberInspectionUpdateSchema = z.object(editableFields);

export type MemberInspectionInput = z.output<typeof memberInspectionInputSchema>;
export type MemberInspectionUpdate = z.output<typeof memberInspectionUpdateSchema>;

/** "8.50", "£8.5" or "8" as pence; null for an empty field, NaN for anything else. */
export function parsePounds(raw: string): number | null {
  const value = raw.trim().replace(/^£/, '').trim();
  if (!value) return null;
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(value)) return Number.NaN;
  return Math.round(Number(value) * 100);
}

// ---------------------------------------------------------------------------------------------
// Days (Europe/London calendar dates as YYYY-MM-DD)
// ---------------------------------------------------------------------------------------------

/** The calendar date `days` after `isoDate` (negative for before). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The days a lunch may be logged for, given today's London date: a week, today included. */
export function loggableDates(today: string): { min: string; max: string } {
  return { min: addDays(today, -LOG_DAYS_BACK), max: today };
}

export function isLoggableDate(visitDate: string, today: string): boolean {
  const { min, max } = loggableDates(today);
  return visitDate >= min && visitDate <= max;
}

/** Whether a member may still edit or delete a log saved at `createdAt`. */
export function isWithinEditWindow(createdAt: Date | string, now: Date = new Date()): boolean {
  const age = now.getTime() - new Date(createdAt).getTime();
  return age >= 0 && age < EDIT_WINDOW_MS;
}

// ---------------------------------------------------------------------------------------------
// Venues and on-site verification
// ---------------------------------------------------------------------------------------------

/**
 * Which venues take logs: public, open, and not Gone But Not Forgotten. Its SQL twin is
 * `loggableVenueCondition` in src/lib/member-inspections.ts.
 */
export function isLoggableVenue(venue: VisibilityFields): boolean {
  return isMappable(venue) && venue.tier !== CLOSED_BUT_LISTED_TIER;
}

/** `gps` when the position is within ON_SITE_METRES of the venue, else `none`. */
export function verifyOnSite(
  position: LatLng | null,
  venue: { lat: number | null; lng: number | null }
): 'gps' | 'none' {
  if (!position || venue.lat === null || venue.lng === null) return 'none';
  const metres = haversineMetres(position, { lat: venue.lat, lng: venue.lng });
  return metres <= ON_SITE_METRES ? 'gps' : 'none';
}

// ---------------------------------------------------------------------------------------------
// Eligibility and weighting
// ---------------------------------------------------------------------------------------------

/**
 * The Two-Visit Rule (Article II): a member's logs at a venue count for scores once they have
 * logged there on two different days. One log per member per day means two logs are two days.
 */
export const ELIGIBLE_AFTER_DAYS = 2;

export function isEligibleCount(daysLoggedAtVenue: number): boolean {
  return daysLoggedAtVenue >= ELIGIBLE_AFTER_DAYS;
}

const WEIGHT_MIN = 0.25;
const WEIGHT_MAX = 1;
/** Below this many different venues a member's weight is the minimum. */
const WEIGHT_RAMP_FROM = 3;
/** At this many different venues a member's weight is full. */
const WEIGHT_RAMP_TO = 10;

/**
 * A member's weight in a venue's score, from how many different venues they have logged at:
 * 0.25 up to 3 venues, rising in equal steps to 1.0 at 10 and staying there.
 */
export function memberWeight(distinctVenues: number): number {
  if (distinctVenues <= WEIGHT_RAMP_FROM) return WEIGHT_MIN;
  if (distinctVenues >= WEIGHT_RAMP_TO) return WEIGHT_MAX;
  const progress = (distinctVenues - WEIGHT_RAMP_FROM) / (WEIGHT_RAMP_TO - WEIGHT_RAMP_FROM);
  return WEIGHT_MIN + progress * (WEIGHT_MAX - WEIGHT_MIN);
}

/** One log's score: the mean of its two star rows. */
export function logScore(log: { qualityScore: number; valueScore: number }): number {
  return (log.qualityScore + log.valueScore) / 2;
}

/** The weighted mean of eligible logs' scores, or null when there are none. */
export function weightedScore(logs: { score: number; weight: number }[]): number | null {
  const total = logs.reduce((sum, log) => sum + log.weight, 0);
  if (total === 0) return null;
  return logs.reduce((sum, log) => sum + log.score * log.weight, 0) / total;
}

// ---------------------------------------------------------------------------------------------
// Anti-gaming checks
// ---------------------------------------------------------------------------------------------

/** Both checks look at the last week of logs at a venue. */
export const GAMING_WINDOW_DAYS = 7;
/** An account younger than this is new. */
export const NEW_ACCOUNT_DAYS = 14;
/** More eligible logs than this from new accounts in a week holds them for the Chairs. */
const NEW_ACCOUNT_LOG_LIMIT = 5;
/** The baseline the week's scores are compared with: the 90 days before the week. */
export const SPIKE_BASELINE_DAYS = 90;
/** A week's mean this far from the baseline (either way) is a spike. */
const SPIKE_POINTS = 1.5;
/** Both the week and the baseline need this many eligible logs before a spike means anything. */
const SPIKE_MIN_LOGS = 3;

export function exceedsNewAccountLimit(newAccountLogsThisWeek: number): boolean {
  return newAccountLogsThisWeek > NEW_ACCOUNT_LOG_LIMIT;
}

export interface ScoreWindow {
  mean: number | null;
  count: number;
}

export function isScoreSpike(week: ScoreWindow, baseline: ScoreWindow): boolean {
  if (week.mean === null || baseline.mean === null) return false;
  if (week.count < SPIKE_MIN_LOGS || baseline.count < SPIKE_MIN_LOGS) return false;
  return Math.abs(week.mean - baseline.mean) > SPIKE_POINTS;
}
