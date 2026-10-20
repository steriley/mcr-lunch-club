import type { APIRoute } from 'astro';
import { authApiError, jsonError, jsonResponse, readJson, requireAdmin, userIdParam, validationError } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { resetPasswordSchema } from '@/lib/user-schema';

export const prerender = false;

/**
 * Sets a temporary password chosen by a Chair and signs the user out
 * everywhere, so they must sign in again with it (and should then change it).
 */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = userIdParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'User not found.');

  const parsed = resetPasswordSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    await auth.api.setUserPassword({ headers: request.headers, body: { userId: id.data, newPassword: parsed.data.password } });
    if (id.data !== session.user.id) {
      await auth.api.revokeUserSessions({ headers: request.headers, body: { userId: id.data } });
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return authApiError('Reset password', error);
  }
};
