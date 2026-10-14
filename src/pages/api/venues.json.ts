import type { APIRoute } from 'astro';
import venuesData from '@/data/venues.json';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(venuesData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
