import {
  adminRoute,
  authApiError,
  errorResponse,
  jsonResponse,
  userIdParam,
} from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { memberAccounts } from '@/lib/members/profiles';

export const prerender = false;

/** Lifts a member's ban (#136). Chairs are deactivated from the Users page instead. */
export const POST = adminRoute(
  {
    action: 'Unban member',
    params: { id: { schema: userIdParam, notFound: 'member_not_found' } },
    onError: (error) => authApiError('Unban member', error),
  },
  async ({ request, params, actor }) => {
    if (!(await memberAccounts.find(db, params.id))) return errorResponse('member_not_found');
    await auth.api.unbanUser({ headers: request.headers, body: { userId: params.id } });
    await memberAccounts.recordEvent(db, {
      memberId: params.id,
      actorId: actor.id,
      action: 'unbanned',
    });
    return jsonResponse({ member: await memberAccounts.find(db, params.id) });
  }
);
