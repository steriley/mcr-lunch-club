import { defineMiddleware } from 'astro:middleware';
import { auth } from '@/lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals } = context;
  const pathname = url.pathname;

  if (pathname.startsWith('/_astro') || pathname.startsWith('/favicon') || pathname.startsWith('/api/auth')) {
    return next();
  }

  if (pathname === '/admin/login') {
    if (request.method === 'GET') {
      const session = await auth.api.getSession({ headers: request.headers });
      if (session) {
        return context.redirect('/admin');
      }
    }
    return next();
  }

  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/');

  if (!isAdminPage && !isAdminApi) {
    return next();
  }

  const origin = request.headers.get('origin');
  if (isAdminApi && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    if (origin && new URL(origin).origin !== url.origin) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session || !session.user) {
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    const destination = new URL('/admin/login', url.origin);
    destination.searchParams.set('next', pathname + url.search);
    return context.redirect(destination.toString());
  }

  if (session.user.role !== 'admin') {
    if (isAdminApi) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response('Forbidden', {
      status: 403,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  locals.user = session.user;
  locals.session = session;

  const response = await next();

  if (isAdminPage) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    response.headers.set('X-Robots-Tag', 'noindex');
  }

  return response;
});
