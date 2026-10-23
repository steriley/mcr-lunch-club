import { adminRoute, authApiError, jsonResponse, userIdParam } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { resetPasswordSchema } from '@/lib/user-schema';

export const prerender = false;

/**
 * Sets a temporary password chosen by a Chair and signs the user out
 * everywhere, so they must sign in again with it (and should then change it).
 */
export const POST = adminRoute(
  {
    action: 'Reset password', publishes: false,
    params: { id: { schema: userIdParam, notFound: 'User not found.' } },
    body: resetPasswordSchema,
    onError: (error) => authApiError('Reset password', error),
  },
  async ({ request, params, body, actor }) => {
    await auth.api.setUserPassword({ headers: request.headers, body: { userId: params.id, newPassword: body.password } });
    if (params.id !== actor.id) {
      await auth.api.revokeUserSessions({ headers: request.headers, body: { userId: params.id } });
    }
    return jsonResponse({ ok: true });
  }
);
