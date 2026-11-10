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

export const prerender = false;

/**
 * Deletes every passkey on an account (#153), for a lost or compromised device. Another Chair is
 * also signed out everywhere, so a session started with a removed passkey ends with it.
 */
export const POST = adminRoute(
  {
    action: 'Remove passkeys',
    params: { id: { schema: userIdParam, notFound: 'user_not_found' } },
    onError: (error) => authApiError('Remove passkeys', error),
  },
  async ({ request, params, actor }) => {
    const notChair = await unlessChairAccount(params.id);
    if (notChair) return notChair;
    const removed = await removeAllPasskeys(db, params.id);
    if (params.id !== actor.id) {
      await auth.api.revokeUserSessions({ headers: request.headers, body: { userId: params.id } });
    }
    return jsonResponse({ ok: true, removed });
  }
);
