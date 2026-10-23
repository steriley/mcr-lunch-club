import type { APIRoute } from 'astro';
import { getCronSecret } from '@/lib/env';
import { requestRebuild } from '@/lib/rebuild';

export const prerender = false;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

/**
 * Rebuilds the site when a new weekly bulletin issue goes out (18:00 London
 * time on Wednesdays, src/lib/weekly-bulletin.ts), since the home page is
 * prerendered. Vercel Cron calls it at 18:00 UTC (vercel.json), which is at or
 * after 18:00 London time all year, and sends CRON_SECRET as a bearer token.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = getCronSecret();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const requested = await requestRebuild('Weekly bulletin');
  return requested ? json({ rebuild: 'requested' }, 202) : json({ error: 'Rebuild could not be requested.' }, 502);
};
