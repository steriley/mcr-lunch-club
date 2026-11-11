import { z } from 'zod';
import { errorResponse, jsonError, jsonResponse } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clearSignedInHint, memberRoute } from '@/lib/member-api';
import { memberAccounts, isFreshSignIn } from '@/lib/members/profiles';

export const prerender = false;

/** The member types this to confirm, so a stray request can't delete an account. */
const deleteAccountSchema = z.object({ confirm: z.literal('delete') });

/**
 * Deletes the member's account and everything about them (#136). Needs a fresh sign-in (by email
 * or passkey, in the last ten minutes), so a stolen session cookie alone can't. Better Auth's
 * own freshness rule is off (`freshAge: 0`), so this is the check.
 */
export const DELETE = memberRoute(
  { action: 'Delete member account', body: deleteAccountSchema },
  async ({ request, session }) => {
    if (!isFreshSignIn(session.session.createdAt)) {
      return jsonError(403, 'Sign in again to confirm it’s you, then delete your account.', {
        form: 'fresh_sign_in_required',
      });
    }
    const outcome = await memberAccounts.delete(db, session.user.id);
    if (!outcome.ok) return errorResponse(outcome.error);

    // The session row went with the account; signing out still expires the cookies.
    const response = jsonResponse({ deleted: true });
    try {
      const { headers } = await auth.api.signOut({ headers: request.headers, returnHeaders: true });
      for (const cookie of headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
    } catch {
      // The session no longer exists, so its cookie is useless either way.
    }
    return clearSignedInHint(response);
  }
);
