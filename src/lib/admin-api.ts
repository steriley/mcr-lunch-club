import type { APIRoute } from 'astro';
import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { auth, type AuthSession } from '@/lib/auth';
import { getAuthEnvironment } from '@/lib/env';
import { hasAdminRole, isBanned } from '@/lib/roles';
import type { Actor } from '@/lib/venue-events';

export { ADMIN_ROLES, hasAdminRole, isBanned } from '@/lib/roles';
export { isUniqueViolation } from '@/lib/db-errors';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const noStoreHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: noStoreHeaders });
}

/** Consistent error shape for every admin endpoint: `{ error, fields? }`. */
export function jsonError(status: number, error: string, fields?: Record<string, string>): Response {
  return jsonResponse(fields ? { error, fields } : { error }, status);
}

export function validationError(error: z.ZodError): Response {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.length ? String(issue.path[0]) : 'form';
    fields[field] ??= issue.message;
  }
  return jsonError(400, 'Please correct the highlighted fields.', fields);
}

/** Logs without request bodies or credentials and returns a generic 500. */
export function serverError(context: string, error: unknown): Response {
  console.error(`[admin] ${context} failed:`, error instanceof Error ? error.message : 'Unknown error');
  return jsonError(500, 'Something went wrong. Please try again.');
}

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toUpperCase());
}

/** Mutating requests must carry an Origin header matching this site. */
export function hasTrustedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;

  const allowed = new Set([new URL(request.url).origin, new URL(getAuthEnvironment().url).origin]);
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

/**
 * Re-checks authentication, role and origin inside every admin API handler,
 * independently of the middleware. Returns the session or an error Response.
 */
export async function requireAdmin(request: Request): Promise<AuthSession | Response> {
  if (isMutatingMethod(request.method) && !hasTrustedOrigin(request)) {
    return jsonError(403, 'Forbidden');
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return jsonError(401, 'Unauthorized');
  }
  if (!hasAdminRole(session.user.role) || isBanned(session.user)) {
    return jsonError(403, 'Forbidden');
  }
  return session;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const uuidParam = z.uuid();

/** Maps a Better Auth API error to the admin error shape; anything else becomes a 500. */
export function authApiError(context: string, error: unknown): Response {
  if (isAPIError(error) && error.statusCode >= 400 && error.statusCode < 500) {
    return jsonError(error.statusCode, error.body?.message || 'That request could not be completed.');
  }
  return serverError(context, error);
}

export const userIdParam = z.string().trim().min(1).max(100);

/** The 409 for a venue slug another venue already has, from the pre-check or the unique index. */
export function slugTaken(): Response {
  return jsonError(409, 'That slug is already in use.', { slug: 'That slug is already in use. Choose another.' });
}

/** A route param: the not-found message for a UUID param, or a custom schema with its message. */
type ParamSpec = string | { schema: z.ZodType<string>; notFound: string };

export interface AdminRouteSpec<P extends string, S extends z.ZodType | undefined> {
  /** Names the action in the server log when it fails, e.g. "Update venue". */
  action: string;
  /** Checked in order; the first invalid one answers 404 with its message. */
  params?: Record<P, ParamSpec>;
  /** Validates the JSON body; failures answer 400 with field errors. */
  body?: S;
  /** Maps errors thrown by the handler; anything left unmapped becomes a logged 500. */
  onError?: (error: unknown) => Response | undefined;
}

export interface AdminRouteContext<P extends string, B> {
  request: Request;
  url: URL;
  params: Record<P, string>;
  body: B;
  /** The signed-in Chair. */
  actor: Actor & { email: string };
}

/**
 * An admin API handler. Before `handler` runs, the request has passed
 * requireAdmin (session, role, ban and origin), its params and its body.
 */
export function adminRoute<P extends string = never, S extends z.ZodType | undefined = undefined>(
  spec: AdminRouteSpec<P, S>,
  handler: (context: AdminRouteContext<P, S extends z.ZodType ? z.output<S> : undefined>) => Promise<Response>
): APIRoute {
  return async ({ request, params: rawParams, url }) => {
    const session = await requireAdmin(request);
    if (session instanceof Response) return session;

    const params = {} as Record<P, string>;
    for (const [name, param] of Object.entries(spec.params ?? {}) as [P, ParamSpec][]) {
      const { schema, notFound } = typeof param === 'string' ? { schema: uuidParam, notFound: param } : param;
      const parsed = schema.safeParse(rawParams[name]);
      if (!parsed.success) return jsonError(404, notFound);
      params[name] = parsed.data;
    }

    let body: unknown;
    if (spec.body) {
      const parsed = spec.body.safeParse(await readJson(request));
      if (!parsed.success) return validationError(parsed.error);
      body = parsed.data;
    }

    const actor = { id: session.user.id, name: session.user.name, email: session.user.email };
    try {
      return await handler({ request, url, params, body: body as never, actor });
    } catch (error) {
      return spec.onError?.(error) ?? serverError(spec.action, error);
    }
  };
}
