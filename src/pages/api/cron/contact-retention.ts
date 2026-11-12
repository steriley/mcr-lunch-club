import type { APIRoute } from 'astro';
import { deleteExpiredContactMessages } from '@/lib/contact-inbox';
import { CONTACT_RETENTION_DAYS } from '@/lib/contact-schema';
import { db } from '@/lib/db';
import { getCronSecret } from '@/lib/env';

export const prerender = false;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * The contact form's retention rule (#132): messages older than CONTACT_RETENTION_DAYS are
 * deleted, read or not. Vercel Cron calls it daily (vercel.json) with CRON_SECRET as a bearer
 * token. It runs whether or not the form is switched on, so switching it off never keeps messages
 * longer than the page says.
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = getCronSecret();
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    const deleted = await deleteExpiredContactMessages(db);
    console.info(
      `[contact] retention: ${deleted} older than ${CONTACT_RETENTION_DAYS} days deleted`
    );
    return json({ deleted }, 200);
  } catch (error) {
    console.error(
      '[contact] retention failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return json({ error: 'Retention failed.' }, 500);
  }
};
