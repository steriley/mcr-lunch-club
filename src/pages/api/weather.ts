import type { APIRoute } from 'astro';
import { getWeatherApiKey } from '@/lib/env';
import { isUsableForecast, summarizeWeather } from '@/lib/weather';

export const prerender = false;

type ForecastStep = 'hourly' | 'daily';

interface CachedForecast {
  data: unknown;
  expiresAt: number;
}

type StepResult =
  | { ok: true; data: unknown; cache: 'hit' | 'miss' }
  | { ok: true; data: unknown; cache: 'stale'; upstreamStatus: number }
  | { ok: false; status: number };

const steps: ForecastStep[] = ['hourly', 'daily'];
const cacheDurationMs = 60 * 60 * 1000;
// Lets Vercel's CDN share a forecast across visitors instead of every page view invoking the function.
const forecastCacheControl = 'public, max-age=0, s-maxage=3600, stale-while-revalidate=1800';
// The raw upstream forecast is cached per step; the compact summary is rebuilt from it on every
// request so "now" always follows the clock rather than the moment the forecast was fetched.
const cache = new Map<ForecastStep, CachedForecast>();
const apiBase = 'https://data.hub.api.metoffice.gov.uk/sitespecific/v0/point';

function jsonResponse(body: Record<string, string>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function unavailable(status: number): Response {
  return jsonResponse({ error: 'Weather is currently unavailable.' }, status);
}

// Falls back to the last good forecast for `step`. `upstreamStatus` is what went wrong (it ends up in the
// Warning header); `failureStatus` is what the visitor gets when there is nothing to fall back to.
function staleResult(step: ForecastStep, upstreamStatus: number, failureStatus = 502): StepResult {
  const stale = cache.get(step);
  return stale
    ? { ok: true, data: stale.data, cache: 'stale', upstreamStatus }
    : { ok: false, status: failureStatus };
}

async function loadStep(step: ForecastStep, apiKey: string | undefined): Promise<StepResult> {
  const cached = cache.get(step);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, data: cached.data, cache: 'hit' };

  if (!apiKey) {
    console.warn(`Met Office ${step} forecast unavailable: METOFFICE_API_KEY is not configured.`);
    return staleResult(step, 503, 503);
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
      return staleResult(step, response.status);
    }

    const data: unknown = await response.json();
    if (!isUsableForecast(data)) {
      console.warn(`Met Office ${step} forecast returned an unexpected response shape.`);
      return staleResult(step, 502);
    }

    cache.set(step, { data, expiresAt: Date.now() + cacheDurationMs });
    return { ok: true, data, cache: 'miss' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error';
    console.warn(`Met Office ${step} forecast request failed: ${reason}`);
    return staleResult(step, 502);
  }
}

export const GET: APIRoute = async () => {
  const apiKey = getWeatherApiKey();
  const [hourly, daily] = await Promise.all(steps.map((step) => loadStep(step, apiKey)));

  if (!hourly.ok) return unavailable(hourly.status);
  if (!daily.ok) return unavailable(daily.status);

  const staleStatuses = [hourly, daily].flatMap((result) =>
    result.cache === 'stale' ? [result.upstreamStatus] : []
  );
  const stale = staleStatuses.length > 0;

  // Both steps were validated before they were cached, so this does not throw on upstream data.
  const summary = summarizeWeather(hourly.data, daily.data, { stale });

  const body = JSON.stringify(summary);
  if (stale) {
    const status = staleStatuses[0];
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Stale data must not be cached at the CDN, or it would outlive the outage.
        'Cache-Control': 'no-store',
        'X-Weather-Cache': 'stale',
        Warning: `110 - "Serving stale weather after upstream status ${status}"`,
      },
    });
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': forecastCacheControl,
      'X-Weather-Cache': hourly.cache === 'miss' || daily.cache === 'miss' ? 'miss' : 'hit',
    },
  });
};
