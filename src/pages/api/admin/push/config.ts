import { adminRoute, jsonResponse } from '@/lib/admin-api';
import { getPushEnvironment } from '@/lib/env';

export const prerender = false;

/** GET /api/admin/push/config: whether push is on, and the public VAPID key to subscribe with. */
export const GET = adminRoute({ action: 'Read push config' }, async () => {
  const keys = getPushEnvironment();
  return jsonResponse({ configured: Boolean(keys), publicKey: keys?.publicKey ?? null });
});
