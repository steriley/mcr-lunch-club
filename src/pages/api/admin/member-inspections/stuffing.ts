import { z } from 'zod';
import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberInspectionsApi } from '@/lib/member-inspections';

export const prerender = false;

const stuffingSchema = z.object({
  venueId: z.uuid({ error: 'Choose a venue.' }),
  inspectionIds: z
    .array(z.uuid())
    .min(1, 'Choose at least one log.')
    .max(200, 'Choose 200 logs or fewer.'),
  title: z
    .string()
    .trim()
    .min(2, 'A title is required.')
    .max(200, 'Title must be 200 characters or fewer.'),
  description: z
    .string()
    .trim()
    .min(10, 'Describe the attempt (at least 10 characters).')
    .max(5000, 'Description must be 5000 characters or fewer.'),
  published: z.boolean().default(false),
});

/**
 * A confirmed stuffing attempt (#137): a new bribery record for the venue, with the chosen logs
 * removed and linked to it. A published record goes into the Hall of Shame at the next publish.
 */
export const POST = adminRoute(
  { action: 'Record stuffing attempt', body: stuffingSchema, status: 201 },
  async ({ body, actor }) => memberInspectionsApi.recordStuffing(db, { ...body, actorId: actor.id })
);
