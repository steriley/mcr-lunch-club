import type { APIRoute } from 'astro';
import { authApiError, jsonError, jsonResponse, requireAdmin, userIdParam } from '@/lib/admin-api';
import { auth } from '@/lib/auth';

export const prerender = false;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = userIdParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'User not found.');

  try {
    const result = await auth.api.unbanUser({ headers: request.headers, body: { userId: id.data } });
    return jsonResponse(result);
  } catch (error) {
    return authApiError('Unban user', error);
  }
};
