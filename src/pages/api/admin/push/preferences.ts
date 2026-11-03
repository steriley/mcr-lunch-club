import { adminRoute, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { preferencesSchema } from '@/lib/push/schema';
import { getPreferences, savePreferences } from '@/lib/push/store';

export const prerender = false;

/** GET /api/admin/push/preferences: which events the caller is notified of, on every device. */
export const GET = adminRoute({ action: 'Read notification preferences' }, async ({ actor }) =>
  jsonResponse({ preferences: await getPreferences(db, actor.id) })
);

/** PUT /api/admin/push/preferences: changes some of them (or dismisses the dashboard prompt). */
export const PUT = adminRoute(
  { action: 'Save notification preferences', body: preferencesSchema },
  async ({ body, actor }) =>
    jsonResponse({ preferences: await savePreferences(db, actor.id, body) })
);
