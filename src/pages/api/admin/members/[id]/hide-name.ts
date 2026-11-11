import { adminRoute, userIdParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberAccounts } from '@/lib/members/profiles';

export const prerender = false;

/** Hides a member's display name (#136). It stays taken; the member may choose one new name. */
export const POST = adminRoute(
  {
    action: 'Hide member name',
    params: { id: { schema: userIdParam, notFound: 'member_not_found' } },
  },
  async ({ params, actor }) =>
    memberAccounts.hideName(db, { memberId: params.id, actorId: actor.id })
);
