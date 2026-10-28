import { londonDate } from '@/lib/london-date';
import type { PublicVenue } from '@/lib/public-data';
import type { TierValue } from '@/lib/tiers';
import { bulletinIssue, nextBulletinIssue, type BulletinIssue } from '@/lib/weekly-bulletin';
import type { Inspection } from '@/types';

/**
 * The homepage "Weekly Summons": one Tuesday pick and one Wednesday pick per
 * Gazette issue, prompts to chase overdue inspections. Nothing is stored. The
 * picks are a pure function of the issue and the public data, so the same issue
 * always gives the same picks, and last week's picks are found by running the
 * previous issue's generation again (see `summonsFor`).
 */

const DAY_MS = 86_400_000;

/** A Tuesday-pool venue that has been inspected is treated as this many days staler when it is Under Consideration. */
export const UNDER_CONSIDERATION_BONUS_DAYS = 60;

/** When a venue last entered a tier, from its latest approved tier proposal. */
export interface TierEntry {
  slug: string;
  tier: TierValue;
  enteredAt: Date;
}

export interface Summons {
  tuesday: PublicVenue | null;
  wednesday: PublicVenue | null;
}

interface Ranked {
  venue: PublicVenue;
  /** Days of staleness; null when there is no date on record, which outranks every dated venue. */
  days: number | null;
}

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  return Math.round((utcDay(toIsoDate) - utcDay(fromIsoDate)) / DAY_MS);
}

/** mulberry32: a small seeded generator, so "random" picks repeat for the same issue. */
function seededRandom(seed: string): () => number {
  let state = 0;
  for (const char of seed) state = (Math.imul(state, 31) + char.charCodeAt(0)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Oldest first. Undated venues are all "oldest": one of them is chosen at
 * random (seeded), ahead of every dated venue. Ties go to the earlier slug.
 */
export function pickOldest(pool: Ranked[], seed: string): PublicVenue | null {
  if (pool.length === 0) return null;
  const undated = pool
    .filter((entry) => entry.days === null)
    .sort((a, b) => a.venue.slug.localeCompare(b.venue.slug));
  if (undated.length > 0) return undated[Math.floor(seededRandom(seed)() * undated.length)].venue;
  const [oldest] = [...pool].sort(
    (a, b) => b.days! - a.days! || a.venue.slug.localeCompare(b.venue.slug)
  );
  return oldest.venue;
}

/** Newest confirmed inspection date per venue slug, ignoring any after `asOf` (YYYY-MM-DD). */
function lastInspections(inspections: Inspection[], asOf: string): Map<string, string> {
  const latest = new Map<string, string>();
  for (const { venueSlug, date } of inspections) {
    // YYYY-MM-DD sorts as text.
    if (date > asOf) continue;
    const known = latest.get(venueSlug);
    if (known === undefined || date > known) latest.set(venueSlug, date);
  }
  return latest;
}

/** Latest entry into To Be Assessed per venue slug, ignoring any after `asOf`. */
function lastEntries(entries: TierEntry[], asOf: Date): Map<string, Date> {
  const latest = new Map<string, Date>();
  for (const { slug, tier, enteredAt } of entries) {
    if (tier !== 'to_be_assessed' || enteredAt > asOf) continue;
    const known = latest.get(slug);
    if (known === undefined || enteredAt > known) latest.set(slug, enteredAt);
  }
  return latest;
}

/** One issue's picks, skipping the `exclude`d slugs. */
export function pickSummons(
  venues: PublicVenue[],
  inspections: Inspection[],
  entries: TierEntry[],
  issue: Pick<BulletinIssue, 'publishedAt' | 'week' | 'yy'>,
  exclude: ReadonlySet<string>
): Summons {
  const today = londonDate(issue.publishedAt);
  const inspected = lastInspections(inspections, today);
  const entered = lastEntries(entries, issue.publishedAt);
  const seed = `${issue.yy}-${issue.week}`;

  const tuesdayPool: Ranked[] = venues
    .filter(
      (venue) =>
        (venue.tier === 'approved' || venue.tier === 'under_consideration') &&
        !exclude.has(venue.slug)
    )
    .map((venue) => {
      const last = inspected.get(venue.slug);
      const bonus = venue.tier === 'under_consideration' ? UNDER_CONSIDERATION_BONUS_DAYS : 0;
      return { venue, days: last === undefined ? null : daysBetween(last, today) + bonus };
    });

  const wednesdayPool: Ranked[] = venues
    .filter((venue) => venue.tier === 'to_be_assessed' && !exclude.has(venue.slug))
    .map((venue) => {
      const since = entered.get(venue.slug);
      return { venue, days: since === undefined ? null : daysBetween(londonDate(since), today) };
    });

  return {
    tuesday: pickOldest(tuesdayPool, `${seed}-tuesday`),
    wednesday: pickOldest(wednesdayPool, `${seed}-wednesday`),
  };
}

/**
 * The first issue with a Weekly Summons (Wednesday 28 October 2026, 23:59 GMT).
 * Earlier issues have no picks, so the replay in `summonsFor` starts here: a
 * fixed start keeps every week's derivation consistent with the week before.
 */
export const FIRST_SUMMONS_ISSUE = new Date('2026-10-28T23:59:00Z');

/**
 * The picks for `issue`. A venue picked in the previous issue is skipped.
 * Nothing is stored, so the previous picks are found by replaying every issue
 * from FIRST_SUMMONS_ISSUE, each skipping the one before, on today's data as
 * of each issue's date. The replay matches what was shown unless a venue
 * changed tier or was edited since.
 *
 * `venues` are the public, mappable venues; `inspections` are confirmed ones;
 * `entries` are tier-entry dates (src/lib/tier-entry-dates.ts).
 */
export function summonsFor(
  venues: PublicVenue[],
  inspections: Inspection[],
  entries: TierEntry[],
  issue: BulletinIssue
): Summons {
  let current = bulletinIssue(FIRST_SUMMONS_ISSUE);
  let summons = pickSummons(venues, inspections, entries, current, new Set());
  while (current.publishedAt < issue.publishedAt) {
    current = nextBulletinIssue(current);
    const exclude = new Set(
      [summons.tuesday?.slug, summons.wednesday?.slug].filter((slug): slug is string =>
        Boolean(slug)
      )
    );
    summons = pickSummons(venues, inspections, entries, current, exclude);
  }
  return summons;
}
