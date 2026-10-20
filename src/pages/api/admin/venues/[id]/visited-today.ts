import type { APIRoute } from 'astro';
import { jsonError, jsonResponse, requireAdmin, serverError, uuidParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getVisitStatus, recordVisit } from '@/lib/inspections';

export const prerender = false;

/**
 * POST /api/admin/venues/[id]/visited-today: this admin visited the venue
 * today (Europe/London, server clock). Two different admins on the same day
 * confirm an inspection. Banned admins are refused by requireAdmin.
 */
export const POST: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return jsonError(404, 'Venue not found.');

  try {
    const now = new Date();
    const outcome = await recordVisit(db, id.data, { id: session.user.id, name: session.user.name, email: session.user.email }, now);
    if (outcome.result === 'not_found') return jsonError(404, 'Venue not found.');
    const status = await getVisitStatus(db, id.data, session.user.id, now);
    return jsonResponse({ result: outcome.result, confirmedNow: outcome.result === 'confirmed' && outcome.confirmedNow, status });
  } catch (error) {
    return serverError('Record visit', error);
  }
};
