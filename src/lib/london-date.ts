/**
 * Calendar dates in Europe/London, from the server clock. Intl handles the
 * GMT/BST switch, so "today" flips at local midnight all year round.
 */

const LONDON_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

/** YYYY-MM-DD for the London calendar day containing `instant`. */
export function londonDate(instant: Date = new Date()): string {
  return LONDON_DATE.format(instant);
}

/** "21 Oct 2026" for a YYYY-MM-DD date (no timezone shift). */
export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
