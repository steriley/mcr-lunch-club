export const prerender = false;

const authHandler = async ({ request }: { request: Request }) => {
  const { auth } = await import('@/lib/auth');
  return auth.handler(request);
};

export const GET = authHandler;
export const POST = authHandler;
export const PUT = authHandler;
export const PATCH = authHandler;
export const DELETE = authHandler;
export const OPTIONS = authHandler;
