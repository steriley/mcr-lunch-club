import {
  adminRoute,
  authApiError,
  jsonResponse,
  userIdParam,
  unlessChairAccount,
} from '@/lib/admin-api';
import { auth } from '@/lib/auth';

export const prerender = false;

export const POST = adminRoute(
  {
    action: 'Unban user',

    params: { id: { schema: userIdParam, notFound: 'user_not_found' } },
    onError: (error) => authApiError('Unban user', error),
  },
  async ({ request, params }) => {
    const notChair = await unlessChairAccount(params.id);
    if (notChair) return notChair;
    const result = await auth.api.unbanUser({
      headers: request.headers,
      body: { userId: params.id },
    });
    return jsonResponse(result);
  }
);
