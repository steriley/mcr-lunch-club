import { adminRoute, jsonError, jsonResponse } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { getPublishStatus, isAlreadyPublishing, publishNow } from '@/lib/publishing';

export const prerender = false;

/**
 * The bar's state: what is pending and whether a publish is under way. It sets no
 * X-Unpublished-Changes header, since the bar's own refresh reads this.
 */
export const GET = adminRoute({ action: 'Read publish status' }, async () => {
  return jsonResponse(await getPublishStatus(db));
});

/**
 * Publishes everything pending by asking Vercel for a build. This is the one
 * admin request that waits on the Deploy Hook (up to 15s). It never clears the
 * pending changes: the build does, once it completes (scripts/publish-settle.ts).
 */
export const POST = adminRoute({ action: 'Publish' }, async ({ actor }) => {
  if (await isAlreadyPublishing(db)) {
    return jsonResponse({ status: 'already-publishing' });
  }
  const accepted = await publishNow(db, {
    source: 'chair',
    requestedBy: actor.id,
    reason: 'Publish',
  });
  if (!accepted) return jsonError(502, "Vercel didn't confirm the publish. Try again.");
  return jsonResponse({ status: 'publishing' }, 202);
});
