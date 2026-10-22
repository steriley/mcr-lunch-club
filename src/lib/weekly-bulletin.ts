import { londonDate } from '@/lib/london-date';
import { tierLabel, type TierValue } from '@/lib/tiers';

/**
 * The homepage "Weekly inspection bulletin": an informal line summarising
 * which venues changed tier during the current Europe/London calendar week
 * (Monday to Sunday), and the Gazette number for that week.
 */

const DAY_MS = 86_400_000;

export interface LondonWeek {
  /** Monday, YYYY-MM-DD. */
  start: string;
  /** Sunday, YYYY-MM-DD. */
  end: string;
  /** ISO week number, 1-53. */
  week: number;
  /** Last two digits of the ISO week-year. */
  yy: string;
}

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The London calendar week containing `now`, with its ISO week number. */
export function londonWeek(now: Date = new Date()): LondonWeek {
  const today = utcDay(londonDate(now));
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS;
  // The ISO week-year and number come from the week's Thursday.
  const thursday = new Date(monday + 3 * DAY_MS);
  const isoYear = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / DAY_MS + 1) / 7);
  return { start: isoDay(monday), end: isoDay(monday + 6 * DAY_MS), week, yy: String(isoYear % 100).padStart(2, '0') };
}

/** e.g. "Gazette #43.26". */
export function gazetteLabel(week: LondonWeek): string {
  return `Gazette #${week.week}.${week.yy}`;
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

/** Changes decided inside `week`, collapsed to one net move per venue (a venue that ended the week where it began is dropped). */
export function changesInWeek(changes: TierChange[], week: LondonWeek): TierChange[] {
  const inWeek = changes
    .filter((change) => {
      const day = londonDate(change.decidedAt);
      return day >= week.start && day <= week.end;
    })
    .sort((a, b) => a.decidedAt.getTime() - b.decidedAt.getTime());

  const net = new Map<string, TierChange>();
  for (const change of inWeek) {
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

/** The one-liner. `changes` must already be the week's net changes (see changesInWeek). */
export function bulletinText(changes: TierChange[]): string {
  if (changes.length === 0) return 'Quiet week on the ledger so far. No verdicts have moved since Monday.';

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
