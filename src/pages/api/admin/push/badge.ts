import { adminRoute, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { badgeFor } from '@/lib/push/store';

export const prerender = false;

/** GET /api/admin/push/badge: what the app badge should show for the caller. */
export const GET = adminRoute({ action: 'Read app badge' }, async ({ actor }) =>
  jsonResponse({ count: await badgeFor(db, actor.id) })
);
