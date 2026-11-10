import {
  adminRoute,
  authApiError,
  jsonResponse,
  userIdParam,
  unlessChairAccount,
} from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { removeAllPasskeys } from '@/lib/passkeys';
import { resetPasswordSchema } from '@/lib/user-schema';

export const prerender = false;

/**
 * Sets a temporary password chosen by a Chair and signs the user out
 * everywhere, so they must sign in again with it (and should then change it).
 * Their passkeys go too (#153): a reset is account recovery, and a passkey
 * someone else added must not outlive it.
 */
export const POST = adminRoute(
  {
    action: 'Reset password',

    params: { id: { schema: userIdParam, notFound: 'user_not_found' } },
    body: resetPasswordSchema,
    onError: (error) => authApiError('Reset password', error),
  },
  async ({ request, params, body, actor }) => {
    const notChair = await unlessChairAccount(params.id);
    if (notChair) return notChair;
    await auth.api.setUserPassword({
      headers: request.headers,
      body: { userId: params.id, newPassword: body.password },
    });
    await removeAllPasskeys(db, params.id);
    if (params.id !== actor.id) {
      await auth.api.revokeUserSessions({ headers: request.headers, body: { userId: params.id } });
    }
    return jsonResponse({ ok: true });
  }
);
