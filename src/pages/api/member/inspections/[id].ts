import { errorResponse, uuidParam } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberRoute } from '@/lib/member-api';
import { memberInspectionUpdateSchema } from '@/lib/member-inspection-rules';
import { memberInspectionsApi } from '@/lib/member-inspections';

export const prerender = false;

/** Edits one of the member's own lunch logs, within 24 hours of saving it (#137). */
export const PATCH = memberRoute(
  { action: 'Edit a lunch log', body: memberInspectionUpdateSchema },
  async ({ body, params, session }) => {
    const id = uuidParam.safeParse(params.id);
    if (!id.success) return errorResponse('member_inspection_not_found');
    return memberInspectionsApi.update(db, session.user.id, id.data, body);
  }
);

/** Deletes one of the member's own lunch logs, within 24 hours of saving it (#137). */
export const DELETE = memberRoute({ action: 'Delete a lunch log' }, async ({ params, session }) => {
  const id = uuidParam.safeParse(params.id);
  if (!id.success) return errorResponse('member_inspection_not_found');
  return memberInspectionsApi.delete(db, session.user.id, id.data);
});
