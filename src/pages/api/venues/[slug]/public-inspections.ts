import type { APIRoute } from 'astro';
import { jsonError, serverError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { memberInspectionsApi } from '@/lib/member-inspections';
import { isMembersEnabled } from '@/lib/members/flag';

export const prerender = false;

/**
 * "Recent inspections from the public" for a venue page (#137). Public and signed-out, so it is
 * outside /api/member (public pages make no member request for a signed-out visitor), but it
 * exists only while the `members` flag is on. It carries nothing that identifies or locates a
 * member, and a display name only when the member opted in. Cached briefly at the edge.
 */
export const GET: APIRoute = async ({ params }) => {
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  const slug = String(params.slug ?? '');
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return jsonError(404, 'Not found');
  try {
    const feed = await memberInspectionsApi.recentPublic(db, slug);
    if (!feed) return jsonError(404, 'Not found');
    return Response.json(feed, {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    return serverError('Public lunch logs', error);
  }
};
