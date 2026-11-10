import { adminRoute, authApiError, jsonResponse } from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { createUserSchema } from '@/lib/user-schema';

export const prerender = false;

export const POST = adminRoute(
  {
    action: 'Create user',

    body: createUserSchema,
    onError: (error) => authApiError('Create user', error),
  },
  async ({ request, body }) => {
    // A Chair's email counts as verified: a Chair never signs in by email, and an unverified
    // account would let Better Auth's email sign-in strip its password before refusing it (#136).
    const result = await auth.api.createUser({
      headers: request.headers,
      body: { ...body, data: { emailVerified: true } },
    });
    return jsonResponse({ user: result.user }, 201);
  }
);
