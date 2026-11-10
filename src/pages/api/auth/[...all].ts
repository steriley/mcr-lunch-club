import { memberAuthPathAccess } from '@/lib/members/auth-paths';

export const prerender = false;

const AUTH_PREFIX = '/api/auth';

const authHandler = async ({ request }: { request: Request }) => {
  // Member email sign-in (#136): requests go only through /api/member/sign-in, and verifying is
  // open only while the `members` flag is on (src/lib/members/auth-paths.ts).
  const path = new URL(request.url).pathname.slice(AUTH_PREFIX.length) || '/';
  if (memberAuthPathAccess(path, true) === 'not_found') return notFound();
  if (memberAuthPathAccess(path, false) === 'not_found') {
    const { isMembersEnabled } = await import('@/lib/members/flag');
    if (!(await isMembersEnabled())) return notFound();
  }
  const { auth } = await import('@/lib/auth');
  return auth.handler(request);
};

function notFound(): Response {
  return new Response(JSON.stringify({ message: 'Not found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET = authHandler;
export const POST = authHandler;
export const PUT = authHandler;
export const PATCH = authHandler;
export const DELETE = authHandler;
export const OPTIONS = authHandler;
