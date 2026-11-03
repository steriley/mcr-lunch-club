import '@/lib/zod-browser';
import { z } from 'zod';
import { londonDate } from '@/lib/london-date';

/**
 * Inputs for visits and field notes, shared by the admin API and the dossier's Visits section. Keep
 * this module free of server-only imports so it can ship to the browser.
 */

/** Longest field note, in characters after trimming. The database checks the same bound. */
export const NOTE_BODY_MAX = 4000;

/** Plain text, 1 to NOTE_BODY_MAX characters after trimming. Newlines inside are kept. */
export const noteBodySchema = z
  .string({ error: 'Write the note.' })
  .trim()
  .min(1, 'Write the note.')
  .max(NOTE_BODY_MAX, 'Keep the note to 4,000 characters or fewer.');

export const noteInputSchema = z.object({ body: noteBodySchema });

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD (no 31st Feb). */
export function isCalendarDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** A visit date: today or an earlier day on the London clock, never the future. `now` is for tests. */
export function visitDateSchema(now: () => Date = () => new Date()) {
  return z
    .string({ error: 'Choose the day of the visit.' })
    .trim()
    .refine(isCalendarDay, 'Choose the day of the visit.')
    .refine((value) => value <= londonDate(now()), 'A visit cannot be in the future.');
}

export function visitInputSchema(now?: () => Date) {
  return z.object({ visitDate: visitDateSchema(now) });
}
