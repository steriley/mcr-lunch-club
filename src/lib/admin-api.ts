import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { auth, type AuthSession } from '@/lib/auth';
import { getAuthEnvironment } from '@/lib/env';

/** The roles allowed into the Chairs' Area. */
export const ADMIN_ROLES = ['admin'];

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

/** Deactivated (banned) accounts may not act, even with a session that outlived the ban. */
export function isBanned(user: { banned?: boolean | null; banExpires?: Date | string | null }, now: Date = new Date()): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires).getTime() > now.getTime();
}

export function hasAdminRole(role: string | null | undefined): boolean {
  return String(role ?? '')
    .split(',')
    .map((value) => value.trim())
    .some((value) => ADMIN_ROLES.includes(value));
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

/** True for Postgres unique-constraint violations, including when wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if ((current as { code?: unknown }).code === '23505') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Maps a Better Auth API error to the admin error shape; anything else becomes a 500. */
export function authApiError(context: string, error: unknown): Response {
  if (isAPIError(error) && error.statusCode >= 400 && error.statusCode < 500) {
    return jsonError(error.statusCode, error.body?.message || 'That request could not be completed.');
  }
  return serverError(context, error);
}

export const userIdParam = z.string().trim().min(1).max(100);
