import { eq } from 'drizzle-orm';
import { briberyRecords, venues, type BriberyRow } from '@/db/schema';
import type { BriberyInput } from '@/lib/bribery-schema';
import type { Database } from '@/lib/db-client';

/** Builds the stored values, resolving the linked venue's name; fails if the venue id is unknown. */
export async function briberyValues(db: Database, input: BriberyInput) {
  let venueNameText = input.venueNameText;
  if (input.venueId) {
    const [venue] = await db.select({ name: venues.name }).from(venues).where(eq(venues.id, input.venueId)).limit(1);
    if (!venue) return { ok: false as const, error: 'Choose a venue from the list.' };
    venueNameText = venueNameText ?? venue.name;
  }

  return {
    ok: true as const,
    values: {
      title: input.title,
      venueId: input.venueId,
      venueNameText,
      incidentDate: input.incidentDate,
      incidentTime: input.incidentTime,
      location: input.location,
      peopleInvolved: input.peopleInvolved,
      witnesses: input.witnesses,
      benefitOffered: input.benefitOffered,
      value: input.value,
      description: input.description,
      outcome: input.outcome,
      published: input.published,
      updatedAt: new Date(),
    } satisfies Partial<typeof briberyRecords.$inferInsert>,
  };
}

export function serializeBribery(record: BriberyRow) {
  return {
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type SerializedBribery = ReturnType<typeof serializeBribery>;

/** Public aliases for the people in the register; the Chairs' Area keeps the real names. */
const PUBLIC_ALIASES: { pattern: RegExp; alias: string }[] = [
  { pattern: /\b(?:Tom(?:my)?\s+)?Pritchard\b|\bTom\b(?!my)/gi, alias: 'Under Study Pritchard, Purveyor of Penitent Roses' },
  { pattern: /\b(?:Stephen|Ste|Steve)\s+Riley\b|\bStephen\b/gi, alias: 'Chair Riley' },
  { pattern: /\bTommy\s+Clark\b|\bTommy\b/gi, alias: 'Chair Clark' },
];

/** Rewrites any known real name in free text to its public alias. */
export function publicText(text: string): string {
  return PUBLIC_ALIASES.reduce((out, { pattern, alias }) => out.replace(pattern, alias), text);
}

/**
 * Display name for the public page: known people get their alias; anyone else
 * is shortened to first name and surname initial. Drops the "@" prefix and any
 * "(Deactivated)" suffix.
 */
export function publicPersonName(name: string): string {
  const clean = name
    .replace(/^@/, '')
    .replace(/\s*\(deactivated\)\s*$/i, '')
    .trim();
  const aliased = publicText(clean);
  if (aliased !== clean) return aliased;
  const [first, ...rest] = clean.split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}
