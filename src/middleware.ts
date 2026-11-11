import { defineMiddleware } from 'astro:middleware';
import {
  hasAdminRole,
  hasTrustedOrigin,
  isBanned,
  isMutatingMethod,
  jsonError,
} from '@/lib/admin-api';
import { auth } from '@/lib/auth';
import { isMemberAccountPage, isMemberRoute } from '@/lib/members/auth-paths';
import { isMembersEnabled } from '@/lib/members/flag';

const ADMIN_PAGE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'X-Robots-Tag': 'noindex, nofollow',
};

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...ADMIN_PAGE_HEADERS },
  });
}

function withAdminPageHeaders(response: Response): Response {
  for (const [name, value] of Object.entries(ADMIN_PAGE_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals } = context;
  const pathname = url.pathname;

  locals.user = null;
  locals.session = null;

  // Member pages and API routes exist only while the `members` flag is on (#136); checked on the
  // server, so hiding links is never the only thing between the public and an unfinished feature.
  if (isMemberRoute(pathname)) {
    if (!(await isMembersEnabled())) {
      return new Response('Not found', {
        status: 404,
        headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
      });
    }
    // The member API gets the admin API's origin check on writes; its handlers check again.
    if (
      pathname.startsWith('/api/member') &&
      isMutatingMethod(request.method) &&
      !hasTrustedOrigin(request)
    ) {
      return jsonError(403, 'Forbidden');
    }
    if (isMemberAccountPage(pathname)) {
      const session = await auth.api.getSession({ headers: request.headers });
      if (!session?.user || isBanned(session.user)) {
        const destination = new URL('/members/sign-in', url.origin);
        destination.searchParams.set('next', pathname + url.search);
        return redirect(destination.pathname + destination.search);
      }
      // Chairs have no member account; their place is the Chairs' Area.
      if (hasAdminRole(session.user.role)) return redirect('/admin');
      locals.user = session.user;
      locals.session = session;
    }
    const response = await next();
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = pathname.startsWith('/api/admin/') || pathname === '/api/admin';

  // Public routes, static assets and Better Auth's own handler (which applies
  // its own origin checks) pass straight through.
  if (!isAdminPage && !isAdminApi) {
    return next();
  }

  if (pathname === '/admin/login') {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session && hasAdminRole(session.user.role)) {
      return redirect('/admin');
    }
    return withAdminPageHeaders(await next());
  }

  if (isAdminApi && isMutatingMethod(request.method) && !hasTrustedOrigin(request)) {
    return jsonError(403, 'Forbidden');
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user) {
    if (isAdminApi) {
      return jsonError(401, 'Unauthorized');
    }
    const destination = new URL('/admin/login', url.origin);
    destination.searchParams.set('next', pathname + url.search);
    return redirect(destination.pathname + destination.search);
  }

  if (!hasAdminRole(session.user.role) || isBanned(session.user)) {
    if (isAdminApi) {
      return jsonError(403, 'Forbidden');
    }
    return new Response('Forbidden', { status: 403, headers: ADMIN_PAGE_HEADERS });
  }

  locals.user = session.user;
  locals.session = session;

  const response = await next();
  return isAdminPage ? withAdminPageHeaders(response) : response;
});
