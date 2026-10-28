import { adminRoute, authApiError, jsonResponse } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { createUserSchema } from '@/lib/user-schema';

export const prerender = false;

export const POST = adminRoute(
  {
    action: 'Create user',
    publishes: false,
    body: createUserSchema,
    onError: (error) => authApiError('Create user', error),
  },
  async ({ request, body }) => {
    const result = await auth.api.createUser({ headers: request.headers, body });
    return jsonResponse({ user: result.user }, 201);
  }
);
