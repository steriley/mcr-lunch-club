export const prerender = false;

import { auth } from '@/lib/auth';
import { adminGuard } from '@/lib/venue-validation';

export async function GET({ request }: { request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const response = await auth.api.listUsers({
    headers: request.headers,
    query: {
      limit: 200,
      sortBy: 'createdAt',
      sortDirection: 'desc',
    },
  });

  return Response.json(response);
}

export async function POST({ request }: { request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Request body is required.' }, { status: 400 });
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const password = String(body.password ?? '').trim();
  const role = body.role === 'user' || body.role === 'admin' ? body.role : 'admin';

  if (!email || !name || !password) {
    return Response.json({ error: 'Email, name and password are required.' }, { status: 400 });
  }

  try {
    const response = await auth.api.createUser({
      headers: request.headers,
      body: {
        email,
        name,
        password,
        role,
      },
    });

    return Response.json(response, { status: 201 });
  } catch (error: any) {
    const message = error?.message ?? 'Unable to add this chair right now.';
    return Response.json({ error: message }, { status: 400 });
  }
}
