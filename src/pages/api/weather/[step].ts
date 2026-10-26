import type { APIRoute } from 'astro';
import { getWeatherApiKey } from '@/lib/env';

export const prerender = false;

type ForecastStep = 'hourly' | 'daily';

interface CachedForecast {
  data: unknown;
  expiresAt: number;
}

const cacheDurationMs = 60 * 60 * 1000;
// Lets Vercel's CDN share a forecast across visitors instead of every page view invoking the function.
const forecastCacheControl = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=1800';
const cache = new Map<ForecastStep, CachedForecast>();
const apiBase = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point';

function jsonResponse(body: Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function isForecastResponse(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !('features' in value)) return false;
  const features = value.features;
  if (!Array.isArray(features) || features.length === 0) return false;
  const feature = features[0];
  if (typeof feature !== 'object' || feature === null || !('properties' in feature)) return false;
  const properties = feature.properties;
  return typeof properties === 'object'
    && properties !== null
    && 'timeSeries' in properties
    && Array.isArray(properties.timeSeries);
}

function staleResponse(step: ForecastStep, status: number): Response | null {
  const stale = cache.get(step);
  if (!stale) return null;
  return new Response(JSON.stringify(stale.data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Weather-Cache': 'stale',
      'Warning': `110 - "Serving stale weather after upstream status ${status}"`,
    },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const requestedStep = params.step;
  if (requestedStep !== 'hourly' && requestedStep !== 'daily') {
    return jsonResponse({ error: 'Weather forecast step must be hourly or daily.' }, 400);
  }
  const step: ForecastStep = requestedStep;
  const cached = cache.get(step);
  if (cached && cached.expiresAt > Date.now()) {
    return new Response(JSON.stringify(cached.data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': forecastCacheControl,
        'X-Weather-Cache': 'hit',
      },
    });
  }

  const apiKey = getWeatherApiKey();
  if (!apiKey) {
    console.warn(`Met Office ${step} forecast unavailable: METOFFICE_API_KEY is not configured.`);
    const stale = staleResponse(step, 503);
    return stale ?? jsonResponse({ error: 'Weather is currently unavailable.' }, 503);
  }

  const url = new URL(`${apiBase}/${step}`);
  url.searchParams.set('latitude', '53.4808');
  url.searchParams.set('longitude', '-2.2426');

  try {
    const response = await fetch(url, {
      headers: { apikey: apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(`Met Office ${step} forecast request failed with HTTP ${response.status}.`);
      const stale = staleResponse(step, response.status);
      return stale ?? jsonResponse({ error: 'Weather is currently unavailable.' }, 502);
    }

    const data: unknown = await response.json();
    if (!isForecastResponse(data)) {
      console.warn(`Met Office ${step} forecast returned an unexpected response shape.`);
      const stale = staleResponse(step, 502);
      return stale ?? jsonResponse({ error: 'Weather is currently unavailable.' }, 502);
    }

    cache.set(step, { data, expiresAt: Date.now() + cacheDurationMs });
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': forecastCacheControl,
        'X-Weather-Cache': 'miss',
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error';
    console.warn(`Met Office ${step} forecast request failed: ${reason}`);
    const stale = staleResponse(step, 502);
    return stale ?? jsonResponse({ error: 'Weather is currently unavailable.' }, 502);
  }
};
