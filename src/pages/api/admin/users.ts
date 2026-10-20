import type { APIRoute } from 'astro';
import { authApiError, jsonResponse, readJson, requireAdmin, validationError } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { createUserSchema } from '@/lib/user-schema';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  try {
    const result = await auth.api.listUsers({
      headers: request.headers,
      query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' },
    });
    return jsonResponse(result);
  } catch (error) {
    return authApiError('List users', error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const parsed = createUserSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await auth.api.createUser({ headers: request.headers, body: parsed.data });
    return jsonResponse({ user: result.user }, 201);
  } catch (error) {
    return authApiError('Create user', error);
  }
};
