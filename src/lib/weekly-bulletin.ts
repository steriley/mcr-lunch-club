import { londonDate, londonHour } from '@/lib/london-date';
import { tierLabel, type TierValue } from '@/lib/tiers';

/**
 * The homepage "Weekly inspection bulletin": an informal line summarising
 * which venues changed tier, and the Gazette number of the issue. An issue
 * goes out at 23:59 Europe/London every Wednesday, which leaves the Chairs
 * the whole day to settle the week's verdicts, and stays up until the next one. Each issue covers the
 * verdicts decided since the previous issue.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Wednesday, as Date#getUTCDay() numbers it. */
const ISSUE_WEEKDAY = 3;
const ISSUE_HOUR = 23;
const ISSUE_MINUTE = 59;

export interface BulletinIssue {
  /** When this issue went out: Wednesday, 23:59 London time. */
  publishedAt: Date;
  /** When the previous issue went out. This issue covers verdicts after it, up to and including publishedAt. */
  coversFrom: Date;
  /** ISO week number of the issue's Wednesday, 1-53. */
  week: number;
  /** Last two digits of the ISO week-year. */
  yy: string;
}

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * `hour`:`minute` London time on the calendar day starting at `dayMs`. London
 * is UTC or UTC+1, and the clocks change at 01:00 on a Sunday, never at the
 * issue time.
 */
function londonInstant(dayMs: number, hour: number, minute: number): Date {
  const utc = new Date(dayMs + hour * HOUR_MS + minute * MINUTE_MS);
  return londonHour(utc) === hour ? utc : new Date(utc.getTime() - HOUR_MS);
}

/** The ISO week number and week-year of the calendar day starting at `dayMs`. */
function isoWeek(dayMs: number): Pick<BulletinIssue, 'week' | 'yy'> {
  // The ISO week-year and number come from the week's Thursday.
  const thursday = new Date(dayMs + (3 - ((new Date(dayMs).getUTCDay() + 6) % 7)) * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / DAY_MS + 1) / 7);
  return { week, yy: String(isoYear % 100).padStart(2, '0') };
}

/** The latest issue out at `now`: last Wednesday's, or today's once 23:59 has passed. */
export function bulletinIssue(now: Date = new Date()): BulletinIssue {
  const today = utcDay(londonDate(now));
  let wednesday = today - ((new Date(today).getUTCDay() - ISSUE_WEEKDAY + 7) % 7) * DAY_MS;
  if (londonInstant(wednesday, ISSUE_HOUR, ISSUE_MINUTE) > now) wednesday -= 7 * DAY_MS;
  return {
    publishedAt: londonInstant(wednesday, ISSUE_HOUR, ISSUE_MINUTE),
    coversFrom: londonInstant(wednesday - 7 * DAY_MS, ISSUE_HOUR, ISSUE_MINUTE),
    ...isoWeek(wednesday),
  };
}

/** Seven days and a few hours, so stepping from one Wednesday 23:59 London to the next stays on the Wednesday. */
const NEXT_ISSUE_STEP_MS = 7 * DAY_MS + 3 * HOUR_MS;

/** The issue after `issue`. */
export function nextBulletinIssue(issue: Pick<BulletinIssue, 'publishedAt'>): BulletinIssue {
  return bulletinIssue(new Date(issue.publishedAt.getTime() + NEXT_ISSUE_STEP_MS));
}

/** e.g. "Gazette #43.26". */
export function gazetteLabel(issue: BulletinIssue): string {
  return `Gazette #${issue.week}.${issue.yy}`;
}

/** An approved tier change, as the public sees it. */
export interface TierChange {
  slug: string;
  name: string;
  fromTier: TierValue | null;
  toTier: TierValue;
  /** When the second Chair approved it. */
  decidedAt: Date;
}

/** Changes the issue covers, collapsed to one net move per venue (a venue that ended where it began is dropped). */
export function changesInIssue(changes: TierChange[], issue: BulletinIssue): TierChange[] {
  const inIssue = changes
    .filter(
      (change) => change.decidedAt > issue.coversFrom && change.decidedAt <= issue.publishedAt
    )
    .sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime());

  const net = new Map<string, TierChange>();
  for (const change of inIssue) {
    const first = net.get(change.slug);
    net.set(change.slug, first ? { ...change, fromTier: first.fromTier } : change);
  }
  return [...net.values()].filter((change) => change.fromTier !== change.toTier);
}

type Group = { verb: string; names: string[] };

function verbFor(change: TierChange): string {
  if (change.fromTier === 'approved') return `knocked off Approved to ${tierLabel(change.toTier)}`;
  switch (change.toTier) {
    case 'approved':
      return 'elevated to Approved';
    case 'under_consideration':
      return 'referred for consideration';
    case 'rejected':
      return 'rejected';
    case 'if_we_must':
      return 'filed under If We Must';
    case 'gone_but_not_forgotten':
      return 'laid to rest';
    case 'to_be_assessed':
      return 'sent back for assessment';
  }
}

function clause({ verb, names }: Group): string {
  if (names.length === 1) return `${names[0]} ${verb}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} ${verb}`;
  return `${names.length} venues ${verb}`;
}

/** The one-liner. `changes` must already be the issue's net changes (see changesInIssue). */
export function bulletinText(changes: TierChange[]): string {
  if (changes.length === 0)
    return 'Quiet week on the ledger. No verdicts have moved since the last bulletin.';

  const groups = new Map<string, Group>();
  for (const change of changes) {
    const verb = verbFor(change);
    const group = groups.get(verb) ?? { verb, names: [] };
    group.names.push(change.name);
    groups.set(verb, group);
  }

  const count = changes.length === 1 ? '1 verdict has' : `${changes.length} verdicts have`;
  return `${count} moved this week: ${[...groups.values()].map(clause).join(', ')}.`;
}
