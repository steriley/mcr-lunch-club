import type { APIRoute } from 'astro';
import { isSnowEnabled } from '@/lib/snow';

export const prerender = false;

// The public pages are prerendered, so the snow flag is read here at request time and the page
// asks for it on load. Cached briefly at the CDN so page views don't each invoke the function.
export const GET: APIRoute = async () =>
  new Response(JSON.stringify({ enabled: await isSnowEnabled() }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
    },
  });
