import { db } from '@/lib/db';
import { memberRoute } from '@/lib/member-api';
import { memberInspectionInputSchema } from '@/lib/member-inspection-rules';
import { memberInspectionsApi } from '@/lib/member-inspections';

export const prerender = false;

/**
 * Logs a lunch (#137). One per member per London day, enforced here and by the database; the
 * position, if sent, decides the on-site check and is never stored.
 */
export const POST = memberRoute(
  { action: 'Log a lunch', body: memberInspectionInputSchema },
  async ({ body, session }) => memberInspectionsApi.create(db, session.user.id, body)
);
