/**
 * The one place dates are formatted for people to read: "31st Mar 26" and
 * "31st Mar 26, 14:05". Month names come from a fixed table, not Intl, so the
 * server and the browser always agree. Times are Europe/London wall-clock.
 *
 * Machine-readable dates (database values, JSON, datetime attributes, date
 * inputs) stay ISO and never go through these functions.
 */

export type DateInput = string | Date | null | undefined;
export interface FormatOptions {
  fallback?: string;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sept',
  'Oct',
  'Nov',
  'Dec',
];
const DEFAULT_FALLBACK = '—';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/;

// Only the numeric parts are used; month names come from MONTHS.
const LONDON_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

interface Parts {
  year: number;
  month: number;
  day: number;
  /** "HH:mm", or null for a date-only value. */
  time: string | null;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** A YYYY-MM-DD calendar day, checked against the real calendar without any timezone. */
function dateOnlyParts(value: string): Parts | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return null;
  return { year, month, day, time: null };
}

/** An instant, as the Europe/London calendar day and wall-clock time. */
function londonParts(instant: Date): Parts | null {
  if (Number.isNaN(instant.getTime())) return null;
  const parts = LONDON_PARTS.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  const [year, month, day, hour, minute] = [
    part('year'),
    part('month'),
    part('day'),
    part('hour'),
    part('minute'),
  ];
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  return { year, month, day, time: `${pad(hour)}:${pad(minute)}` };
}

function toParts(value: DateInput): Parts | null {
  if (value instanceof Date) return londonParts(value);
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (DATE_ONLY.test(text)) return dateOnlyParts(text);
  // Only full ISO timestamps; anything else ("Awaiting Assessment", "Mar 2026") is not a date.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return null;
  return londonParts(new Date(text));
}

function dateText({ year, month, day }: Parts): string {
  return `${ordinal(day)} ${MONTHS[month - 1]} ${pad(year % 100)}`;
}

/** "31st Mar 26". Date-only strings are calendar days; timestamps use the London day. */
export function formatDate(value: DateInput, options: FormatOptions = {}): string {
  const parts = toParts(value);
  return parts ? dateText(parts) : (options.fallback ?? DEFAULT_FALLBACK);
}

/**
 * "31st Mar 26, 14:05" for a timestamp (London time). A date-only string has
 * no time, so it formats as the date alone unless `time` ("HH:mm" or
 * "HH:mm:ss", recorded separately, no timezone conversion) is given.
 */
export function formatDateTime(
  value: DateInput,
  options: FormatOptions & { time?: string | null } = {}
): string {
  const parts = toParts(value);
  if (!parts) return options.fallback ?? DEFAULT_FALLBACK;
  const recorded = options.time ? TIME_OF_DAY.exec(options.time.trim()) : null;
  const time = parts.time ?? (recorded ? `${recorded[1]}:${recorded[2]}` : null);
  return time ? `${dateText(parts)}, ${time}` : dateText(parts);
}
