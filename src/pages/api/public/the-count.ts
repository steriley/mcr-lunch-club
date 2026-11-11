import type { APIRoute } from 'astro';
import { jsonError, serverError } from '@/lib/admin-api';
import { db } from '@/lib/db';
import { isMembersEnabled } from '@/lib/members/flag';
import { theCount } from '@/lib/public-scores';

export const prerender = false;

/** The Count (#138) as JSON, behind the `members` flag. The page itself is /the-count. */
export const GET: APIRoute = async () => {
  if (!(await isMembersEnabled())) return jsonError(404, 'Not found');
  try {
    return Response.json(await theCount(db), {
      headers: {
        'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=600',
        'X-Robots-Tag': 'noindex',
      },
    });
  } catch (error) {
    return serverError('The Count', error);
  }
};
