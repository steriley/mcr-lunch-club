import { adminRoute, userIdParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberAccounts } from '@/lib/members/profiles';

export const prerender = false;

/** Lets a member whose second name was hidden choose a name again (#136). */
export const POST = adminRoute(
  {
    action: 'Allow member name',
    params: { id: { schema: userIdParam, notFound: 'member_not_found' } },
  },
  async ({ params, actor }) =>
    memberAccounts.allowName(db, { memberId: params.id, actorId: actor.id })
);
