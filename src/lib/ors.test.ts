import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MATRIX_BATCH_SIZE,
  OrsError,
  routeToVenueValues,
  searchPlaces,
  walkingMatrixFromBase,
  walkingRoute,
  walkingRouteFromBase,
} from './ors';
import { BASE_COORDINATES } from './map/config';

const API_KEY = 'secret-ors-key';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL, init: RequestInit = {}) => {
    const call = { url: String(url), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls, apiKey: API_KEY };
}

async function rejection(promise: Promise<unknown>): Promise<OrsError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof OrsError, `expected OrsError, got ${error}`);
    assert.ok(!error.message.includes(API_KEY), 'error message must not contain the API key');
    return error;
  }
  assert.fail('expected a rejection');
}

const venue = { lat: 53.4813, lng: -2.2498 };

describe('routeToVenueValues', () => {
  it('converts metres to miles, rounded to two decimals', () => {
    assert.equal(
      routeToVenueValues({ distanceMetres: 1609.344, durationSeconds: 60 }).distanceMiles,
      1
    );
    assert.equal(
      routeToVenueValues({ distanceMetres: 805, durationSeconds: 60 }).distanceMiles,
      0.5
    );
    assert.equal(
      routeToVenueValues({ distanceMetres: 123.4, durationSeconds: 60 }).distanceMiles,
      0.08
    );
  });

  it('works out whole minutes from distance at a slow pace, with a one-minute minimum', () => {
    assert.equal(routeToVenueValues({ distanceMetres: 0, durationSeconds: 0 }).walkingTimeMin, 1);
    assert.equal(
      routeToVenueValues({ distanceMetres: 1609.344, durationSeconds: 60 }).walkingTimeMin,
      24
    );
    // Kool Runnings: 1.49 miles takes about 36 minutes on foot.
    assert.equal(
      routeToVenueValues({ distanceMetres: 1.49 * 1609.344, durationSeconds: 1740 }).walkingTimeMin,
      36
    );
  });
});

describe('walkingRoute', () => {
  it('posts [lon, lat] pairs to the foot-walking endpoint with the key in the Authorization header', async () => {
    const ors = fakeFetch(() =>
      Response.json({ routes: [{ summary: { distance: 412.5, duration: 297 } }] })
    );
    const route = await walkingRoute({ lat: 53.1, lng: -2.1 }, { lat: 53.2, lng: -2.2 }, ors);
    assert.deepEqual(route, { distanceMetres: 412.5, durationSeconds: 297 });

    const [call] = ors.calls;
    assert.equal(call.url, 'https://api.openrouteservice.org/v2/directions/foot-walking');
    assert.equal(call.init.method, 'POST');
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      coordinates: [
        [-2.1, 53.1],
        [-2.2, 53.2],
      ],
    });
    assert.equal((call.init.headers as Record<string, string>).Authorization, API_KEY);
    assert.ok(!call.url.includes(API_KEY), 'the key must not be in the URL');
  });

  it('routes from HQ', async () => {
    const ors = fakeFetch(() =>
      Response.json({ routes: [{ summary: { distance: 1, duration: 1 } }] })
    );
    await walkingRouteFromBase(venue, ors);
    const body = JSON.parse(String(ors.calls[0].init.body));
    assert.deepEqual(body.coordinates[0], [BASE_COORDINATES.lng, BASE_COORDINATES.lat]);
  });

  it('treats a summary without distance (venue at HQ) as zero', async () => {
    const ors = fakeFetch(() => Response.json({ routes: [{ summary: {} }] }));
    assert.deepEqual(await walkingRoute(venue, venue, ors), {
      distanceMetres: 0,
      durationSeconds: 0,
    });
  });

  it('reports HTTP 429 as rate limited', async () => {
    const ors = fakeFetch(() => new Response('{"error":"Rate limit exceeded"}', { status: 429 }));
    assert.equal((await rejection(walkingRoute(venue, venue, ors))).kind, 'rate_limited');
  });

  it('reports 404 and an empty route list as no result', async () => {
    const notFound = fakeFetch(() => Response.json({ error: { code: 2009 } }, { status: 404 }));
    assert.equal((await rejection(walkingRoute(venue, venue, notFound))).kind, 'no_result');
    const empty = fakeFetch(() => Response.json({ routes: [] }));
    assert.equal((await rejection(walkingRoute(venue, venue, empty))).kind, 'no_result');
  });

  it('reports server errors, network failures and unreadable bodies as unavailable', async () => {
    for (const respond of [
      () => new Response('down', { status: 503 }),
      () => Promise.reject(new TypeError('fetch failed')),
      () => new Response('not json', { status: 200 }),
    ]) {
      assert.equal(
        (await rejection(walkingRoute(venue, venue, fakeFetch(respond)))).kind,
        'unavailable'
      );
    }
  });

  it('times out slow responses', async () => {
    const ors = fakeFetch(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          // AbortSignal.timeout() does not keep the process alive on its own.
          const keepAlive = setTimeout(() => {}, 1000);
          init.signal?.addEventListener('abort', () => {
            clearTimeout(keepAlive);
            reject(init.signal!.reason);
          });
        })
    );
    const error = await rejection(walkingRoute(venue, venue, { ...ors, timeoutMs: 20 }));
    assert.equal(error.kind, 'unavailable');
    assert.match(error.message, /did not respond in time/);
  });

  it('refuses to run without a key', async () => {
    const ors = fakeFetch(() => Response.json({}));
    const previous = process.env.ORS_API_KEY;
    delete process.env.ORS_API_KEY;
    try {
      assert.equal(
        (await rejection(walkingRoute(venue, venue, { fetch: ors.fetch }))).kind,
        'not_configured'
      );
      assert.equal(ors.calls.length, 0);
    } finally {
      if (previous !== undefined) process.env.ORS_API_KEY = previous;
    }
  });
});

describe('searchPlaces', () => {
  const feature = (
    properties: Record<string, string>,
    coordinates: [number, number] = [-2.2498, 53.4813]
  ) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties,
  });

  it('asks for five GB results around HQ and maps [lon, lat] features to candidates', async () => {
    const ors = fakeFetch(() =>
      Response.json({
        type: 'FeatureCollection',
        features: [
          feature({
            label: "Crazy Pedro's, Manchester, England, United Kingdom",
            name: "Crazy Pedro's",
            housenumber: '55',
            street: 'Bridge Street',
            postalcode: 'M3 3BQ',
          }),
          feature(
            { label: 'Deansgate, Manchester, England, United Kingdom', name: 'Deansgate' },
            [-2.25, 53.48]
          ),
        ],
      })
    );
    const results = await searchPlaces('crazy pedros', ors);
    assert.deepEqual(results, [
      {
        label: "Crazy Pedro's, Manchester, England, United Kingdom",
        address: '55 Bridge Street, M3 3BQ',
        lat: 53.4813,
        lng: -2.2498,
      },
      {
        label: 'Deansgate, Manchester, England, United Kingdom',
        address: 'Deansgate, Manchester, England, United Kingdom',
        lat: 53.48,
        lng: -2.25,
      },
    ]);

    const url = new URL(ors.calls[0].url);
    assert.equal(url.pathname, '/geocode/search');
    assert.equal(url.searchParams.get('text'), 'crazy pedros');
    assert.equal(url.searchParams.get('size'), '5');
    assert.equal(url.searchParams.get('boundary.country'), 'GB');
    assert.equal(url.searchParams.get('focus.point.lat'), String(BASE_COORDINATES.lat));
    assert.equal(url.searchParams.get('focus.point.lon'), String(BASE_COORDINATES.lng));
    assert.equal(url.searchParams.get('boundary.circle.lat'), String(BASE_COORDINATES.lat));
    assert.ok(Number(url.searchParams.get('boundary.circle.radius')) > 0);
    assert.equal(url.searchParams.get('api_key'), null);
    assert.equal((ors.calls[0].init.headers as Record<string, string>).Authorization, API_KEY);
  });

  it('caps the list at five and skips features without coordinates', async () => {
    const features = [
      { properties: { label: 'No point' } },
      ...Array.from({ length: 7 }, (_, index) => feature({ label: `Place ${index}` })),
    ];
    const results = await searchPlaces(
      'place',
      fakeFetch(() => Response.json({ features }))
    );
    assert.deepEqual(
      results.map((result) => result.label),
      ['Place 0', 'Place 1', 'Place 2', 'Place 3']
    );
  });

  it('returns an empty list when nothing matches', async () => {
    assert.deepEqual(
      await searchPlaces(
        'zzzz',
        fakeFetch(() => Response.json({ features: [] }))
      ),
      []
    );
    assert.deepEqual(
      await searchPlaces(
        'zzzz',
        fakeFetch(() => new Response('', { status: 404 }))
      ),
      []
    );
  });

  it('passes rate limits through', async () => {
    assert.equal(
      (
        await rejection(
          searchPlaces(
            'pizza',
            fakeFetch(() => new Response('', { status: 429 }))
          )
        )
      ).kind,
      'rate_limited'
    );
  });
});

describe('walkingMatrixFromBase', () => {
  it('asks for one source (HQ) and many destinations, and maps nulls to no route', async () => {
    const ors = fakeFetch(() =>
      Response.json({ distances: [[402.3, null]], durations: [[300, null]] })
    );
    const results = await walkingMatrixFromBase(
      [
        { lat: 53.48, lng: -2.24 },
        { lat: 53.49, lng: -2.23 },
      ],
      ors
    );
    assert.deepEqual(results, [{ distanceMetres: 402.3, durationSeconds: 300 }, null]);

    const [call] = ors.calls;
    assert.equal(call.url, 'https://api.openrouteservice.org/v2/matrix/foot-walking');
    assert.equal((call.init.headers as Record<string, string>).Authorization, API_KEY);
    assert.deepEqual(JSON.parse(String(call.init.body)), {
      locations: [
        [BASE_COORDINATES.lng, BASE_COORDINATES.lat],
        [-2.24, 53.48],
        [-2.23, 53.49],
      ],
      sources: [0],
      destinations: [1, 2],
      metrics: ['distance', 'duration'],
      units: 'm',
    });
  });

  it('makes no request for an empty list and refuses oversized batches', async () => {
    const ors = fakeFetch(() => Response.json({}));
    assert.deepEqual(await walkingMatrixFromBase([], ors), []);
    assert.equal(ors.calls.length, 0);
    const tooMany = Array.from({ length: MATRIX_BATCH_SIZE + 1 }, () => ({
      lat: 53.48,
      lng: -2.25,
    }));
    await assert.rejects(walkingMatrixFromBase(tooMany, ors));
  });

  it('passes rate limits through', async () => {
    const ors = fakeFetch(() => new Response('', { status: 429 }));
    assert.equal(
      (await rejection(walkingMatrixFromBase([{ lat: 53.48, lng: -2.25 }], ors))).kind,
      'rate_limited'
    );
  });
});
