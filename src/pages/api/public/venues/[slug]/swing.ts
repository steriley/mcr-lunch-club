import type { APIRoute } from 'astro';
import { jsonError, serverError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { isMembersEnabled } from '@/lib/members/flag';
import { venueSwing } from '@/lib/public-scores';

export const prerender = false;

/**
 * A venue's Swing-o-meter (#138). Public and signed-out, outside /api/member, and present only
 * while the `members` flag is on. It carries counts, a band and a score, and nothing about any
 * member.
 */
export const GET: APIRoute = async ({ params }) => {
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  const slug = String(params.slug ?? '');
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return jsonError(404, 'Not found');
  try {
    const swing = await venueSwing(db, slug);
    if (!swing) return jsonError(404, 'Not found');
    return Response.json(swing, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    return serverError('Swing-o-meter', error);
  }
};
