import type { APIRoute } from 'astro';
import { isAPIError } from 'better-auth/api';
import { z } from 'zod';
import { waitUntil } from '@vercel/functions';
import { auth, type AuthSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAuthEnvironment } from '@/lib/env';
import { MAX_IMAGES_PER_VENUE, CAPTION_MAX } from '@/lib/image-upload';
import type { Outcome, PublicChange } from '@/lib/outcome';
import { countPendingChanges, publishNow, recordPendingChange } from '@/lib/publishing';
import { hasAdminRole, isBanned } from '@/lib/roles';
import type { Actor } from '@/lib/venue-events';

export { hasAdminRole, isBanned } from '@/lib/roles';
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
export function jsonError(
  status: number,
  error: string,
  fields?: Record<string, string>
): Response {
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
  console.error(
    `[admin] ${context} failed:`,
    error instanceof Error ? error.message : 'Unknown error'
  );
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
    return jsonError(
      error.statusCode,
      error.body?.message || 'That request could not be completed.'
    );
  }
  return serverError(context, error);
}

export const userIdParam = z.string().trim().min(1).max(100);

/** How a domain error code answers over HTTP. `fields` point the form at the input to correct. */
export interface ErrorHttp {
  status: number;
  message: string;
  fields?: Record<string, string>;
}

const SLUG_TAKEN = 'That slug is already in use.';

/**
 * Every domain error code and how it answers, in one place (#112). Domain
 * modules return codes and never know about statuses or wording. A route can
 * override entries with `errors` in its spec.
 */
export const ERROR_HTTP = {
  // Not found
  venue_not_found: { status: 404, message: 'Venue not found.' },
  image_not_found: { status: 404, message: 'Photo not found.' },
  proposal_not_found: { status: 404, message: 'Proposal not found.' },
  bribery_not_found: { status: 404, message: 'Bribery record not found.' },
  suggestion_not_found: { status: 404, message: 'Suggestion not found.' },
  user_not_found: { status: 404, message: 'User not found.' },
  note_not_found: { status: 404, message: 'Note not found.' },
  visit_not_found: { status: 404, message: 'Visit not found.' },
  // Venues
  slug_taken: {
    status: 409,
    message: SLUG_TAKEN,
    fields: { slug: 'That slug is already in use. Choose another.' },
  },
  suggestion_unavailable: {
    status: 409,
    message:
      'That suggestion has already been accepted or dismissed, or no longer exists. Nothing was saved.',
  },
  already_closed: { status: 409, message: 'This venue is already marked closed.' },
  not_closed: { status: 409, message: 'This venue is not closed.' },
  needs_location: {
    status: 409,
    message: 'This venue needs a location before its walking route can be worked out.',
  },
  route_rate_limited: { status: 429, message: 'The walking route could not be worked out.' },
  route_unavailable: { status: 503, message: 'The walking route could not be worked out.' },
  // Tier proposals
  same_as_current: { status: 409, message: 'That is already the venue’s approved verdict.' },
  same_as_pending: { status: 409, message: 'That verdict change is already waiting for approval.' },
  pending_by_other: {
    status: 409,
    message:
      'Another admin’s verdict proposal is already pending for this venue. Approve or decline it first.',
  },
  needs_verified_inspection: {
    status: 409,
    message:
      'Moving a venue into Approved needs a dual-verified inspection first: two Chairs press “Visited today” on the same day. Imported legacy dates do not count.',
  },
  not_pending: { status: 409, message: 'This proposal has already been decided or withdrawn.' },
  own_proposal: {
    status: 403,
    message: 'You proposed this change, so a different admin must approve or decline it.',
  },
  not_proposer: {
    status: 403,
    message: 'Only the admin who proposed this change can withdraw it.',
  },
  reason_required: {
    status: 400,
    message: 'Give a reason for declining. It is kept internal and never shown publicly.',
  },
  // Photos
  too_many_images: {
    status: 409,
    message: `A venue can have at most ${MAX_IMAGES_PER_VENUE} photos. Delete one first.`,
  },
  caption_too_long: {
    status: 400,
    message: `Keep the caption to ${CAPTION_MAX} characters or fewer.`,
    fields: { caption: `Keep the caption to ${CAPTION_MAX} characters or fewer.` },
  },
  invalid_focal: {
    status: 400,
    message: 'The focal point must be two whole numbers from 0 to 100, or both empty.',
  },
  invalid_photo: { status: 400, message: 'That photo could not be used.' },
  uploads_not_configured: { status: 503, message: 'Image uploads are not configured.' },
  // Inspections
  outcome_required: {
    status: 400,
    message: 'Say how the inspection went.',
    fields: { outcome: 'Choose satisfactory or below par.' },
  },
  outcome_mismatch: {
    status: 409,
    message: 'You can only cosign the outcome the first Chair recorded for today.',
    fields: { outcome: 'Does not match the first Chair’s outcome.' },
  },
  // The Golden Cut
  golden_cut_venue_missing: {
    status: 400,
    message: 'One of those venues no longer exists. Reload the page and try again.',
  },
  golden_cut_not_approved: {
    status: 400,
    message: 'A venue that is not Approved cannot be in The Golden Cut.',
  },
  // Bribery
  bribery_venue_unknown: {
    status: 400,
    message: 'Please correct the highlighted fields.',
    fields: { venueId: 'Choose a venue from the list.' },
  },
} as const satisfies Record<string, ErrorHttp>;

type ErrorCode = keyof typeof ERROR_HTTP;

/** The 409 for a venue slug another venue already has, from the pre-check or the unique index. */
export function slugTaken(): Response {
  return errorResponse('slug_taken');
}

/**
 * The response for a domain error code: the route's override, else the
 * central table, with the failure's own `detail` replacing the message. A
 * code in neither is a bug in the route and answers a logged 500.
 */
export function errorResponse(
  code: string,
  overrides: Readonly<Record<string, ErrorHttp>> = {},
  detail?: string
): Response {
  const entry: ErrorHttp | undefined =
    overrides[code] ?? (ERROR_HTTP as Record<string, ErrorHttp>)[code];
  if (!entry) return serverError('Unmapped error code', new Error(code));
  return jsonError(entry.status, detail ?? entry.message, entry.fields);
}

/** A route param: the not-found code for a UUID param, or a custom schema with its code. */
type ParamSpec = ErrorCode | { schema: z.ZodType<string>; notFound: ErrorCode };

export interface AdminRouteSpec<P extends string, S extends z.ZodType | undefined> {
  /** Names the action in the server log when it fails, e.g. "Update venue". */
  action: string;
  /** Checked in order; the first invalid one answers 404 with its message. */
  params?: Record<P, ParamSpec>;
  /** Validates the JSON body; failures answer 400 with field errors. */
  body?: S;
  /** The status of a success when the handler returns an `Outcome`. Defaults to 200. */
  status?: number;
  /** Overrides of ERROR_HTTP for this route, keyed by error code. */
  errors?: Readonly<Record<string, ErrorHttp>>;
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
 *
 * The handler answers with a `Response`, or with a domain `Outcome` (#112):
 * a success becomes `jsonResponse(value, spec.status)`, a failure is mapped
 * through ERROR_HTTP (and `spec.errors`), and the outcome's `published`
 * change is recorded for the Chairs to publish.
 */
export function adminRoute<P extends string = never, S extends z.ZodType | undefined = undefined>(
  spec: AdminRouteSpec<P, S>,
  handler: (
    context: AdminRouteContext<P, S extends z.ZodType ? z.output<S> : undefined>
  ) => Promise<Response | Outcome<unknown>>
): APIRoute {
  return async ({ request, params: rawParams, url }) => {
    const session = await requireAdmin(request);
    if (session instanceof Response) return session;

    const params = {} as Record<P, string>;
    for (const [name, param] of Object.entries(spec.params ?? {}) as [P, ParamSpec][]) {
      const { schema, notFound } =
        typeof param === 'string' ? { schema: uuidParam, notFound: param } : param;
      const parsed = schema.safeParse(rawParams[name]);
      if (!parsed.success) return errorResponse(notFound);
      params[name] = parsed.data;
    }

    let body: unknown;
    if (spec.body) {
      const parsed = spec.body.safeParse(await readJson(request));
      if (!parsed.success) return validationError(parsed.error);
      body = parsed.data;
    }

    const actor = { id: session.user.id, name: session.user.name, email: session.user.email };
    let response: Response;
    let published: PublicChange | undefined;
    try {
      const result = await handler({
        request,
        url,
        params,
        body: body as never,
        actor,
      });
      if (result instanceof Response) {
        response = result;
      } else if (result.ok) {
        response = jsonResponse(result.value, spec.status ?? 200);
        published = result.published;
      } else {
        response = errorResponse(result.error, spec.errors, result.detail);
      }
    } catch (error) {
      return spec.onError?.(error) ?? serverError(spec.action, error);
    }
    if (published) await recordPublish(published, actor.id, response);
    return response;
  };
}

/** The Chairs' bar reads this header to update without a reload (src/lib/api-fetch.ts). */
const UNPUBLISHED_HEADER = 'X-Unpublished-Changes';

/**
 * Records the change a successful operation made. The change itself is
 * already saved, so a failure here is logged and the response still goes out.
 */
async function recordPublish(
  change: PublicChange,
  actorId: string,
  response: Response
): Promise<void> {
  try {
    await recordPendingChange(db, {
      action: change.action,
      venueId: change.venueId,
      venueName: change.venueName,
      actorId,
    });
    response.headers.set(UNPUBLISHED_HEADER, String(await countPendingChanges(db)));
  } catch (error) {
    console.error(
      `[admin] ${change.action}: could not record the pending change:`,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
  if (change.when === 'now') {
    waitUntil(
      publishNow(db, { source: 'auto', requestedBy: actorId, reason: change.action }).catch(
        () => undefined
      )
    );
  }
}
