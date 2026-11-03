import { adminRoute, authApiError, jsonError, jsonResponse, userIdParam } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteUserSubscriptions } from '@/lib/push/store';

export const prerender = false;

/** Deactivates a user; Better Auth also revokes their sessions, and their push devices are removed. */
export const POST = adminRoute(
  {
    action: 'Ban user',

    params: { id: { schema: userIdParam, notFound: 'User not found.' } },
    onError: (error) => authApiError('Ban user', error),
  },
  async ({ request, params, actor }) => {
    if (params.id === actor.id) return jsonError(400, 'You cannot deactivate your own account.');
    const result = await auth.api.banUser({
      headers: request.headers,
      body: { userId: params.id, banReason: 'Deactivated by a Chair.' },
    });
    await deleteUserSubscriptions(db, params.id);
    return jsonResponse(result);
  }
);
