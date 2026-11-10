import {
  adminRoute,
  authApiError,
  jsonError,
  jsonResponse,
  userIdParam,
  unlessChairAccount,
} from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeAllPasskeys } from '@/lib/passkeys';
import { deleteUserSubscriptions } from '@/lib/push/store';

export const prerender = false;

/**
 * Deactivates a user; Better Auth also revokes their sessions, and their push devices and passkeys
 * are removed (#153), so reactivating them later never brings back a key from a lost device.
 */
export const POST = adminRoute(
  {
    action: 'Ban user',

    params: { id: { schema: userIdParam, notFound: 'user_not_found' } },
    onError: (error) => authApiError('Ban user', error),
  },
  async ({ request, params, actor }) => {
    const notChair = await unlessChairAccount(params.id);
    if (notChair) return notChair;
    if (params.id === actor.id) return jsonError(400, 'You cannot deactivate your own account.');
    const result = await auth.api.banUser({
      headers: request.headers,
      body: { userId: params.id, banReason: 'Deactivated by a Chair.' },
    });
    await deleteUserSubscriptions(db, params.id);
    await removeAllPasskeys(db, params.id);
    return jsonResponse(result);
  }
);
