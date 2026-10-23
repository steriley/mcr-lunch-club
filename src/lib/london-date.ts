/**
 * Calendar dates in Europe/London, from the server clock. Intl handles the
 * GMT/BST switch, so "today" flips at local midnight all year round.
 */

// dates-guard:allow builds the machine-readable YYYY-MM-DD day, not display text
const LONDON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD for the London calendar day containing `instant`. */
export function londonDate(instant: Date = new Date()): string {
  return LONDON_DATE.format(instant);
}

// dates-guard:allow reads the London hour as a number for scheduling, not display text
const LONDON_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' });

/** The London wall-clock hour (0-23) at `instant`. */
export function londonHour(instant: Date = new Date()): number {
  return Number(LONDON_HOUR.format(instant));
}
