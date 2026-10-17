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

  try {
    const response = await auth.api.unbanUser({
      headers: request.headers,
      body: { userId: id },
    });

    return Response.json(response);
  } catch (error: any) {
    return Response.json({ error: error?.message ?? 'Unable to unban this chair right now.' }, { status: 400 });
  }
}
