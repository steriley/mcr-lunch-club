import type { APIRoute } from 'astro';
import { jsonError, jsonResponse } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clearSignedInHint } from '@/lib/member-api';
import { isMembersEnabled } from '@/lib/members/flag';
import { memberAccounts } from '@/lib/members/profiles';
import { hasAdminRole, isActiveChair, isBanned } from '@/lib/roles';

export const prerender = false;

/**
 * Who is signed in, for the header island (#136). Public pages call it only when the `signed_in`
 * hint cookie is present (epic #135, "Performance budget"). A hint that outlived its session (a
 * ban, a revoke, an expiry) is cleared here, so the island stops asking.
 */
export const GET: APIRoute = async ({ request }) => {
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  const session = await auth.api.getSession({ headers: request.headers });
  const signedInUser = session?.user;
  if (!signedInUser || isBanned(signedInUser)) {
    return clearSignedInHint(jsonResponse({ state: 'signed_out' }));
  }
  if (hasAdminRole(signedInUser.role)) {
    return isActiveChair(signedInUser)
      ? jsonResponse({ state: 'chair' })
      : clearSignedInHint(jsonResponse({ state: 'signed_out' }));
  }
  const profile = await memberAccounts.getProfile(db, signedInUser.id).catch(() => null);
  return jsonResponse({
    state: 'member',
    // A name the Chairs hid is never shown, the member's own header included (as on /members/me).
    displayName: profile && !profile.nameHidden ? profile.displayName : null,
  });
};
