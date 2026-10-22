import { adminRoute, authApiError, jsonResponse } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { createUserSchema } from '@/lib/user-schema';

export const prerender = false;

export const GET = adminRoute({ action: 'List users', onError: (error) => authApiError('List users', error) }, async ({ request }) => {
  const result = await auth.api.listUsers({
    headers: request.headers,
    query: { limit: 200, sortBy: 'createdAt', sortDirection: 'desc' },
  });
  return jsonResponse(result);
});

export const POST = adminRoute(
  { action: 'Create user', body: createUserSchema, onError: (error) => authApiError('Create user', error) },
  async ({ request, body }) => {
    const result = await auth.api.createUser({ headers: request.headers, body });
    return jsonResponse({ user: result.user }, 201);
  }
);
