import type { APIRoute } from 'astro';
import { db } from '@/lib/db';
import { getCronSecret } from '@/lib/env';
import { isMembersEnabled } from '@/lib/members/flag';
import { refreshAllScores } from '@/lib/public-scores';

export const prerender = false;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * The Swing-o-meter's daily refresh (#138): recomputes every venue's People's score, writes the
 * day's history point and drops history older than 90 days. Writes already recompute their own
 * venue; this catches bans, deleted accounts and weights that moved with logs elsewhere. Vercel
 * Cron sends CRON_SECRET as a bearer token (vercel.json). It does nothing while the flag is off.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = getCronSecret();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  if (!(await isMembersEnabled())) return json({ skipped: 'members flag is off' }, 200);
  try {
    return json({ ...(await refreshAllScores(db)) }, 200);
  } catch (error) {
    console.error('Swing-o-meter refresh failed', error);
    return json({ error: 'Refresh failed.' }, 500);
  }
};
