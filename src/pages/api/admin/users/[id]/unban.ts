import { adminRoute, authApiError, jsonResponse, userIdParam } from '@/lib/admin-api';
import { auth } from '@/lib/auth';

export const prerender = false;

export const POST = adminRoute(
  {
    action: 'Unban user',
    publishes: false,
    params: { id: { schema: userIdParam, notFound: 'User not found.' } },
    onError: (error) => authApiError('Unban user', error),
  },
  async ({ request, params }) => {
    const result = await auth.api.unbanUser({
      headers: request.headers,
      body: { userId: params.id },
    });
    return jsonResponse(result);
  }
);
