import type { APIRoute } from 'astro';
import { authApiError, jsonError, jsonResponse, requireAdmin, userIdParam } from '@/lib/admin-api';
import { auth } from '@/lib/auth';

export const prerender = false;

/** Deactivates a user; Better Auth also revokes their sessions. */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = userIdParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'User not found.');
  if (id.data === session.user.id) return jsonError(400, 'You cannot deactivate your own account.');

  try {
    const result = await auth.api.banUser({
      headers: request.headers,
      body: { userId: id.data, banReason: 'Deactivated by a Chair.' },
    });
    return jsonResponse(result);
  } catch (error) {
    return authApiError('Ban user', error);
  }
};
