/**
 * Calendar dates in Europe/London, from the server clock. Intl handles the
 * GMT/BST switch, so "today" flips at local midnight all year round.
 */

// dates-guard:allow builds the machine-readable YYYY-MM-DD day, not display text
const LONDON_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD for the London calendar day containing `instant`. */
export function londonDate(instant: Date = new Date()): string {
  return LONDON_DATE.format(instant);
}

// dates-guard:allow reads the London hour as a number for scheduling, not display text
const LONDON_HOUR = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** The London wall-clock hour (0-23) at `instant`. */
export function londonHour(instant: Date = new Date()): number {
  return Number(LONDON_HOUR.format(instant));
}

// dates-guard:allow reads London wall-clock parts to find midnight, not display text
const LONDON_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Whole seconds from `instant` to the next 00:00 in Europe/London, at least 1. Steps forward an
 * hour at a time from the wall clock, so the 23- and 25-hour days at the clock changes come out
 * right: the answer is the first instant whose London date is tomorrow.
 */
export function secondsUntilLondonMidnight(instant: Date = new Date()): number {
  const parts = Object.fromEntries(
    LONDON_PARTS.formatToParts(instant).map((part) => [part.type, Number(part.value)])
  );
  const elapsed = parts.hour * 3600 + parts.minute * 60 + parts.second;
  const today = londonDate(instant);
  // A first guess from the wall clock, then corrected by up to an hour either way for a clock change.
  let guess = instant.getTime() + (24 * 3600 - elapsed) * 1000;
  while (londonDate(new Date(guess - 3600_000)) !== today) guess -= 3600_000;
  while (londonDate(new Date(guess)) === today) guess += 3600_000;
  return Math.max(1, Math.round((guess - instant.getTime()) / 1000));
}
