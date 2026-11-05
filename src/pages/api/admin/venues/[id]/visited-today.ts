import { z } from 'zod';
import { adminRoute } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { INSPECTION_OUTCOMES } from '@/lib/inspection-display';
import { getVisitStatus, recordVisit } from '@/lib/inspections';
import { ok } from '@/lib/outcome';
import { notifyChairs } from '@/lib/push/dispatch';
import { visitEvent } from '@/lib/push/messages';
import { inspectionEntries, toTimelineView } from '@/lib/venue-history';
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
 * adminRoute. A press that confirms the inspection returns its `timelineEntry`. The response carries the presser's visit for today (without
 * its notes) so the dossier can offer a field note.
 */
export const POST = adminRoute(
  {
    action: 'Record visit',
    params: { id: 'venue_not_found' },
    body: visitInputSchema,
  },
  async ({ params, body, actor }) => {
    const now = new Date();
    const recorded = await recordVisit(db, params.id, actor, body.outcome, now);
    if (!recorded.ok) return recorded;

    const outcome = recorded.value;
    // A first press asks the others to countersign; the countersign tells the first Chair.
    if (
      (outcome.result === 'waiting' && outcome.startedNow) ||
      (outcome.result === 'confirmed' && outcome.confirmedNow)
    )
      notifyChairs(visitEvent(outcome.inspection));
    const status = await getVisitStatus(db, params.id, actor.id, now);
    const { visit, inspection } = outcome;
    return ok(
      {
        result: outcome.result,
        confirmedNow: outcome.result === 'confirmed' && outcome.confirmedNow,
        status,
        // The confirmation's timeline line, built by the server; null for any other press.
        timelineEntry:
          outcome.result === 'confirmed' && outcome.confirmedNow
            ? toTimelineView(inspectionEntries([inspection])[0])
            : null,
        visit: serializeVisit(visit, visit.inspectionId === inspection.id ? inspection : null),
      },
      recorded.published
    );
  }
);
