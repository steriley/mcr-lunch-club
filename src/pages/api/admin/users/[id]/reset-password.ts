export const prerender = false;

import { auth } from '@/lib/auth';
import { adminGuard } from '@/lib/venue-validation';

export async function POST({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'User id is required.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Request body is required.' }, { status: 400 });
  }

  const newPassword = String(body.password ?? '').trim();
  if (!newPassword || newPassword.length < 12) {
    return Response.json({ error: 'Password must be at least 12 characters.' }, { status: 400 });
  }

  try {
    const response = await auth.api.setUserPassword({
      headers: request.headers,
      body: {
        userId: id,
        newPassword,
      },
    });

    return Response.json(response);
  } catch (error: any) {
    return Response.json({ error: error?.message ?? 'Unable to reset this password right now.' }, { status: 400 });
  }
}
