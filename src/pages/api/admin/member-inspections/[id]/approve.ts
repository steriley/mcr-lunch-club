import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberInspectionsApi } from '@/lib/member-inspections';

export const prerender = false;

/** Releases a held lunch log (#137). Member logs are fetched by the venue page, so nothing is published. */
export const POST = adminRoute(
  { action: 'Approve lunch log', params: { id: 'member_inspection_not_found' } },
  async ({ params, actor }) =>
    memberInspectionsApi.approve(db, { id: params.id, actorId: actor.id })
);
