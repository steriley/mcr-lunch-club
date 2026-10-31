import type { APIRoute } from 'astro';
import { db } from '@/lib/db';
import { getCronSecret } from '@/lib/env';
import { countPendingChanges, publishNow } from '@/lib/publishing';

export const prerender = false;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * The safety net for batch publishing: a Chair's forgotten Publish never
 * outlasts the next morning. Vercel Cron calls it daily at 05:00 UTC
 * (vercel.json) with CRON_SECRET as a bearer token. With nothing pending it
 * makes no hook call and answers 204.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = getCronSecret();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if ((await countPendingChanges(db)) === 0) {
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  const accepted = await publishNow(db, {
    source: 'nightly',
    requestedBy: null,
    reason: 'Nightly publish',
  });
  return accepted
    ? json({ rebuild: 'requested' }, 202)
    : json({ error: 'Rebuild could not be requested.' }, 502);
};
