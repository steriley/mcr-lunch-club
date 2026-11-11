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

/** Bans a member (#136): Better Auth revokes their sessions and refuses new ones. Chairs are deactivated from the Users page instead. */
export const POST = adminRoute(
  {
    action: 'Ban member',
    params: { id: { schema: userIdParam, notFound: 'member_not_found' } },
    onError: (error) => authApiError('Ban member', error),
  },
  async ({ request, params, actor }) => {
    if (!(await memberAccounts.find(db, params.id))) return errorResponse('member_not_found');
    await auth.api.banUser({
      headers: request.headers,
      body: { userId: params.id, banReason: 'Banned by the Chairs.' },
    });
    // The ban has happened; a failure to log it must not report it as failed.
    try {
      await memberAccounts.recordEvent(db, {
        memberId: params.id,
        actorId: actor.id,
        action: 'banned',
      });
    } catch (error) {
      console.error(
        '[admin] Ban member: could not log the event:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    return jsonResponse({ member: await memberAccounts.find(db, params.id) });
  }
);
