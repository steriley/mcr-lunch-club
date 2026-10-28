import type { PublicVenue } from '@/lib/public-data';
import { safeWebsiteUrl } from '@/lib/website';

/**
 * schema.org Restaurant markup for a venue page, so search engines can show its
 * address, price and cuisine. No markup for a closed venue: it is no longer a
 * place to send anyone. The page embeds it with serializeForScript.
 */
export function venueStructuredData(venue: PublicVenue & { websiteUrl?: string | null }, pageUrl: string): Record<string, unknown> | null {
  if (venue.closed) return null;
  const website = safeWebsiteUrl(venue.websiteUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: venue.name,
    url: pageUrl,
    priceRange: venue.cost,
    ...(venue.cuisine && venue.cuisine !== 'Other' && { servesCuisine: venue.cuisine }),
    ...(venue.address && {
      address: {
        '@type': 'PostalAddress',
        streetAddress: venue.address,
        addressLocality: 'Manchester',
        addressCountry: 'GB',
      },
    }),
    ...(venue.lat !== null && venue.lng !== null && {
      geo: { '@type': 'GeoCoordinates', latitude: venue.lat, longitude: venue.lng },
    }),
    ...(venue.image && { image: new URL(venue.image.url, pageUrl).href }),
    ...(venue.mapSearchLink && { hasMap: venue.mapSearchLink }),
    // `url` is this page; the venue's own site is the same entity elsewhere.
    ...(website && { sameAs: website }),
  };
}
