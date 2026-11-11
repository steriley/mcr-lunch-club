import type { APIRoute } from 'astro';
import type { z } from 'zod';
import {
  errorResponse,
  hasTrustedOrigin,
  isMutatingMethod,
  jsonError,
  jsonResponse,
  readJson,
  serverError,
  validationError,
  type ErrorHttp,
} from '@/lib/admin-api';
import { auth, type AuthSession } from '@/lib/auth';
import { isProduction } from '@/lib/env';
import { isMembersEnabled } from '@/lib/members/flag';
import type { Outcome } from '@/lib/outcome';
import { hasAdminRole, isBanned } from '@/lib/roles';

/**
 * The HTTP side of the member API (/api/member/**, #136), the member counterpart of `adminRoute`.
 * It shares admin-api's response shape, origin check and error table (ERROR_HTTP), and like the
 * admin API sends `no-store`. Chairs have no member profile, so member routes refuse them.
 */

/** The readable signed-in hint (src/lib/auth-config.ts), expired. */
export function clearSignedInHint(response: Response): Response {
  response.headers.append(
    'Set-Cookie',
    `signed_in=; Path=/; Max-Age=0; SameSite=Lax${isProduction() ? '; Secure' : ''}`
  );
  return response;
}

/**
 * Re-checks, inside each handler, what the middleware checks: the flag, the origin on writes, and
 * a signed-in member (not a Chair, not banned). Returns the session or the refusal.
 */
async function requireMember(request: Request): Promise<AuthSession | Response> {
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  if (isMutatingMethod(request.method) && !hasTrustedOrigin(request)) {
    return jsonError(403, 'Forbidden');
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return clearSignedInHint(jsonError(401, 'Please sign in.'));
  if (hasAdminRole(session.user.role)) {
    return jsonError(403, 'Chairs don’t have a member account.');
  }
  if (isBanned(session.user)) return jsonError(403, 'This account has been suspended.');
  return session;
}

export interface MemberRouteSpec<S extends z.ZodType | undefined> {
  /** Names the action in the server log when it fails. */
  action: string;
  /** Validates the JSON body; failures answer 400 with field errors. */
  body?: S;
  /** Overrides of ERROR_HTTP for this route, keyed by error code. */
  errors?: Readonly<Record<string, ErrorHttp>>;
}

export interface MemberRouteContext<B> {
  request: Request;
  /** The route's raw params; validate before use. */
  params: Record<string, string | undefined>;
  body: B;
  session: AuthSession;
}

/** A member API handler: answers with a Response, or an Outcome mapped through ERROR_HTTP. */
export function memberRoute<S extends z.ZodType | undefined = undefined>(
  spec: MemberRouteSpec<S>,
  handler: (
    context: MemberRouteContext<S extends z.ZodType ? z.output<S> : undefined>
  ) => Promise<Response | Outcome<unknown>>
): APIRoute {
  return async ({ request, params }) => {
    const session = await requireMember(request);
    if (session instanceof Response) return session;

    let body: unknown;
    if (spec.body) {
      const parsed = spec.body.safeParse(await readJson(request));
      if (!parsed.success) return validationError(parsed.error);
      body = parsed.data;
    }

    try {
      const result = await handler({ request, params: params ?? {}, body: body as never, session });
      if (result instanceof Response) return result;
      return result.ok
        ? jsonResponse(result.value)
        : errorResponse(result.error, spec.errors, result.detail);
    } catch (error) {
      return serverError(spec.action, error);
    }
  };
}
