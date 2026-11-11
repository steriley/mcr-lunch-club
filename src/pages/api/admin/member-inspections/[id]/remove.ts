import { z } from 'zod';
import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberInspectionsApi } from '@/lib/member-inspections';

export const prerender = false;

const removeSchema = z.object({
  reason: z.string().trim().max(500, 'Keep the reason to 500 characters or fewer.').default(''),
});

/** Removes a lunch log (#137), with a reason that stays internal. */
export const POST = adminRoute(
  { action: 'Remove lunch log', params: { id: 'member_inspection_not_found' }, body: removeSchema },
  async ({ params, body, actor }) =>
    memberInspectionsApi.remove(db, { id: params.id, actorId: actor.id, reason: body.reason })
);
