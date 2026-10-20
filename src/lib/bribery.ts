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
