import { z } from 'zod';
import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { INSPECTION_OUTCOMES } from '@/lib/inspection-display';
import { getVisitStatus, recordVisit } from '@/lib/inspections';
import { notifyChairs } from '@/lib/push/dispatch';
import { visitEvent } from '@/lib/push/messages';
import { serializeVisit } from '@/lib/visits';

export const prerender = false;

/** The first Chair names the outcome; a cosigner may omit it (they affirm the first Chair's). An empty body is allowed. */
const visitInputSchema = z.preprocess(
  (body) => body ?? {},
  z.object({
    outcome: z.enum(INSPECTION_OUTCOMES, { error: 'Choose satisfactory or below par.' }).optional(),
  })
);

/**
 * POST /api/admin/venues/[id]/visited-today: this admin visited the venue
 * today (Europe/London, server clock), with body `{ outcome }`. Two different
 * admins on the same day confirm an inspection; the first press sets the
 * outcome and the cosigner affirms it. Banned admins are refused by
 * adminRoute. The response carries the presser's visit for today (without
 * its notes) so the dossier can offer a field note.
 */
export const POST = adminRoute(
  {
    action: 'Record visit',
    publish: 'queue',
    venueParam: 'id',
    params: { id: 'Venue not found.' },
    body: visitInputSchema,
  },
  async ({ params, body, actor }) => {
    const now = new Date();
    const outcome = await recordVisit(db, params.id, actor, body.outcome, now);
    if (outcome.result === 'not_found') return jsonError(404, 'Venue not found.');
    if (outcome.result === 'outcome_required')
      return jsonError(400, 'Say how the inspection went.', {
        outcome: 'Choose satisfactory or below par.',
      });
    if (outcome.result === 'outcome_mismatch') {
      return jsonError(409, 'You can only cosign the outcome the first Chair recorded for today.', {
        outcome: 'Does not match the first Chair’s outcome.',
      });
    }
    // A first press asks the others to countersign; the countersign tells the first Chair.
    if (
      (outcome.result === 'waiting' && outcome.startedNow) ||
      (outcome.result === 'confirmed' && outcome.confirmedNow)
    )
      notifyChairs(visitEvent(outcome.inspection));
    const status = await getVisitStatus(db, params.id, actor.id, now);
    const { visit, inspection } = outcome;
    return jsonResponse({
      result: outcome.result,
      confirmedNow: outcome.result === 'confirmed' && outcome.confirmedNow,
      status,
      visit: serializeVisit(visit, visit.inspectionId === inspection.id ? inspection : null),
    });
  }
);
