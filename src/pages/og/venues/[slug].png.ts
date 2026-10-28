import type { APIRoute } from 'astro';
import { renderOgCard, type OgCardVenue } from '@/lib/og-card';
import { getPublicVenueDetails } from '@/lib/public-data';

// Built with the site, like the venue pages that link to these cards.
export const prerender = true;

/** Only venues without a photo get a card; the rest use their photo. */
export async function getStaticPaths() {
  const venues = await getPublicVenueDetails();
  return venues
    .filter((venue) => !venue.image)
    .map((venue) => ({
      params: { slug: venue.slug },
      props: {
        venue: {
          name: venue.name,
          tier: venue.tier,
          cost: venue.cost,
          walkingTimeMin: venue.walkingTimeMin,
        },
      },
    }));
}

export const GET: APIRoute = async ({ props }) => {
  const png = await renderOgCard(props.venue as OgCardVenue);
  return new Response(png as BodyInit, { headers: { 'Content-Type': 'image/png' } });
};
