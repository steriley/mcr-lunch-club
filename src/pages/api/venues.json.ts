import type { APIRoute } from 'astro';
import { getPublishedVenues, PUBLIC_CACHE_CONTROL } from '@/lib/public-data';

export const prerender = false;

export const GET: APIRoute = async () => {
  const venues = await getPublishedVenues();
  return new Response(JSON.stringify(venues, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': PUBLIC_CACHE_CONTROL,
    },
  });
};
