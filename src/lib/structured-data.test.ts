import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicVenue } from './public-data';
import { serializeForScript } from './public-data';
import { breadcrumbStructuredData, venueStructuredData } from './structured-data';

const venue: PublicVenue = {
  id: 'happy-seasons',
  name: 'Happy Seasons',
  slug: 'happy-seasons',
  tier: 'approved',
  lat: 53.4781,
  lng: -2.2405,
  distanceMiles: 0.51,
  walkingTimeMin: 10,
  cost: '££',
  cuisine: 'Asian',
  eatLikeUs: 'Three-roast meat platter',
  lastInspectionDate: '2026-09-02',
  address: '59 Faulkner Street, M1 4FF',
  mapSearchLink: 'https://www.google.com/maps/search/?api=1&query=53.478100%2C-2.240500',
  image: null,
  closed: false,
};
const url = 'https://mcrlunchclub.com/venues/happy-seasons';

describe('venueStructuredData', () => {
  it('describes an open venue as a schema.org Restaurant', () => {
    assert.deepEqual(venueStructuredData(venue, url), {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      name: 'Happy Seasons',
      url,
      priceRange: '££',
      servesCuisine: 'Asian',
      address: { '@type': 'PostalAddress', streetAddress: '59 Faulkner Street, M1 4FF', addressLocality: 'Manchester', addressCountry: 'GB' },
      geo: { '@type': 'GeoCoordinates', latitude: 53.4781, longitude: -2.2405 },
      hasMap: venue.mapSearchLink,
    });
  });

  it('includes the photo when there is one', () => {
    const image = { url: 'https://abc.public.blob.vercel-storage.com/a.webp', thumbUrl: '', width: 800, height: 600, alt: '', focalX: null, focalY: null };
    assert.equal(venueStructuredData({ ...venue, image }, url)?.image, image.url);
  });

  it('makes a site-relative photo absolute', () => {
    const image = { url: '/venues/flat-iron.jpg', thumbUrl: '', width: null, height: null, alt: '', focalX: null, focalY: null };
    assert.equal(venueStructuredData({ ...venue, image }, url)?.image, 'https://mcrlunchclub.com/venues/flat-iron.jpg');
  });

  it('links the venue website as sameAs when it is http(s)', () => {
    assert.equal(venueStructuredData({ ...venue, websiteUrl: 'https://happyseasons.example' }, url)?.sameAs, 'https://happyseasons.example/');
    for (const websiteUrl of [null, 'javascript:alert(1)']) {
      assert.equal('sameAs' in venueStructuredData({ ...venue, websiteUrl }, url)!, false);
    }
    assert.equal('sameAs' in venueStructuredData(venue, url)!, false);
  });

  it('leaves out an Other cuisine and an empty address', () => {
    const data = venueStructuredData({ ...venue, cuisine: 'Other', address: '' }, url)!;
    assert.equal('servesCuisine' in data, false);
    assert.equal('address' in data, false);
  });

  it('has no markup for a closed venue', () => {
    assert.equal(venueStructuredData({ ...venue, closed: true }, url), null);
  });

  it('cannot close its script tag when a name contains markup', () => {
    const json = serializeForScript(venueStructuredData({ ...venue, name: '</script><script>alert(1)</script>' }, url));
    assert.equal(json.includes('</script>'), false);
  });
});

describe('breadcrumbStructuredData', () => {
  const trail = [
    { name: 'Map', href: '/' },
    { name: 'Verdicts', href: '/verdicts/approved' },
    { name: 'Approved', href: '/verdicts/approved' },
    { name: 'Happy Seasons', href: '/venues/happy-seasons' },
  ];

  it('lists each step as a positioned ListItem with an absolute URL', () => {
    assert.deepEqual(breadcrumbStructuredData(trail, url), {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Map', item: 'https://mcrlunchclub.com/' },
        { '@type': 'ListItem', position: 2, name: 'Verdicts', item: 'https://mcrlunchclub.com/verdicts/approved' },
        { '@type': 'ListItem', position: 3, name: 'Approved', item: 'https://mcrlunchclub.com/verdicts/approved' },
        { '@type': 'ListItem', position: 4, name: 'Happy Seasons', item: 'https://mcrlunchclub.com/venues/happy-seasons' },
      ],
    });
  });

  it('cannot close its script tag when a name contains markup', () => {
    const json = serializeForScript(breadcrumbStructuredData([{ name: '</script><script>alert(1)</script>', href: '/' }], url));
    assert.equal(json.includes('</script>'), false);
  });
});
