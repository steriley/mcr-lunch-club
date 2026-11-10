import { isAPIError } from 'better-auth/api';
import { adminRoute, authApiError, jsonError, jsonResponse } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  grantPasskeyRegistration,
  isPasswordCheckLimited,
  PASSKEY_GRANT_SECONDS,
  recordPasswordCheckFailure,
} from '@/lib/passkeys';
import { confirmPasswordSchema } from '@/lib/user-schema';

export const prerender = false;

/**
 * Confirms the signed-in Chair's password so they may add a passkey in the next few minutes
 * (#153). Wrong passwords are counted per Chair and limited (src/lib/passkeys.ts).
 */
export const POST = adminRoute(
  {
    action: 'Confirm password for a passkey',
    body: confirmPasswordSchema,
    onError: (error) => authApiError('Confirm password for a passkey', error),
  },
  async ({ request, body, actor }) => {
    if (await isPasswordCheckLimited(db, actor.id)) {
      return jsonError(429, 'Too many wrong passwords. Please wait a few minutes and try again.');
    }
    try {
      await auth.api.verifyPassword({
        headers: request.headers,
        body: { password: body.password },
      });
    } catch (error) {
      if (isAPIError(error) && error.statusCode === 400) {
        await recordPasswordCheckFailure(db, actor.id);
        return jsonError(400, 'That password isn’t right.', {
          password: 'That password isn’t right.',
        });
      }
      throw error;
    }
    await grantPasskeyRegistration(db, actor.id);
    return jsonResponse({ ok: true, expiresInSeconds: PASSKEY_GRANT_SECONDS });
  }
);
