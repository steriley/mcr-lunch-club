import { existsSync } from 'node:fs';
import { env, loadEnvFile } from 'node:process';

const mode = env.NODE_ENV ?? 'development';
for (const file of [`.env.${mode}.local`, `.env.${mode}`, '.env.local', '.env']) {
  if (existsSync(file)) {
    loadEnvFile(file);
  }
}

function required(name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}.`);
  }
  return value;
}

function optional(name: string): string | undefined {
  return env[name]?.trim() || undefined;
}

function validateDatabaseUrl(name: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid environment variable: ${name} must be a valid PostgreSQL URL.`);
  }

  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`Invalid environment variable: ${name} must use the postgres or postgresql protocol.`);
  }

  return value;
}

function validateAuthUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid environment variable: BETTER_AUTH_URL must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Invalid environment variable: BETTER_AUTH_URL must use http or https.');
  }

  return value;
}

export function getRuntimeDatabaseUrl(): string {
  return validateDatabaseUrl('DATABASE_URL', required('DATABASE_URL'));
}

export function getMigrationDatabaseUrl(): string {
  const value = optional('DATABASE_URL_UNPOOLED') ?? optional('DATABASE_URL');
  if (!value) {
    throw new Error('Missing required environment variable: DATABASE_URL_UNPOOLED (or fallback DATABASE_URL).');
  }
  return validateDatabaseUrl(optional('DATABASE_URL_UNPOOLED') ? 'DATABASE_URL_UNPOOLED' : 'DATABASE_URL', value);
}

export type DatabaseDriver = 'pg' | 'neon-http';

/**
 * `pg` (default) uses node-postgres over TCP and supports transactions.
 * `neon-http` sends queries over HTTPS for environments where outbound
 * Postgres connections are blocked; it does not support transactions.
 */
export function getDatabaseDriver(): DatabaseDriver {
  const value = optional('DATABASE_DRIVER') ?? 'pg';
  if (value !== 'pg' && value !== 'neon-http') {
    throw new Error('Invalid environment variable: DATABASE_DRIVER must be "pg" or "neon-http".');
  }
  return value;
}

/** True on a Vercel Preview Deployment (VERCEL_ENV is a Vercel system variable). */
export function isVercelPreview(): boolean {
  return env.VERCEL_ENV === 'preview';
}

/**
 * Origins a Vercel Preview Deployment is served from: the stable per-branch
 * URL first, then the per-deployment URL. Empty outside previews.
 */
export function getPreviewOrigins(): string[] {
  if (!isVercelPreview()) return [];
  const hosts = [optional('VERCEL_BRANCH_URL'), optional('VERCEL_URL')].filter((host): host is string => Boolean(host));
  return Array.from(new Set(hosts.map((host) => `https://${host}`)));
}

function hostOf(value: string): string {
  return (value.includes('://') ? new URL(value).host : value).toLowerCase();
}

/**
 * Hosts the site answers on, for Better Auth's `allowedHosts`: the auth URL's
 * host, this deployment's Vercel URLs (per-branch and per-deployment, plus the
 * production domain on production) and any extra hosts or wildcard patterns in
 * BETTER_AUTH_ALLOWED_HOSTS, comma-separated.
 */
function getAllowedHosts(authUrl: string): string[] {
  const vercelHosts = [optional('VERCEL_BRANCH_URL'), optional('VERCEL_URL')];
  if (env.VERCEL_ENV === 'production') {
    vercelHosts.push(optional('VERCEL_PROJECT_PRODUCTION_URL'));
  }
  const extraHosts = (optional('BETTER_AUTH_ALLOWED_HOSTS') ?? '').split(',').map((host) => host.trim());

  const hosts = [authUrl, ...vercelHosts, ...extraHosts].filter((host): host is string => Boolean(host));
  return Array.from(new Set(hosts.map(hostOf)));
}

export function getAuthEnvironment() {
  const secret = required('BETTER_AUTH_SECRET');
  if (secret.length < 32) {
    throw new Error('Invalid environment variable: BETTER_AUTH_SECRET must be at least 32 characters long.');
  }

  // Preview URLs change per branch and deployment, so previews use their own
  // URL rather than a fixed BETTER_AUTH_URL (which may be the production one).
  const [previewUrl] = getPreviewOrigins();
  const url = previewUrl ?? validateAuthUrl(required('BETTER_AUTH_URL'));

  return {
    secret,
    url,
    allowedHosts: getAllowedHosts(url),
  };
}

export function getSeedChairEnvironment() {
  return {
    email: required('SEED_CHAIR_EMAIL'),
    password: required('SEED_CHAIR_PASSWORD'),
    name: optional('SEED_CHAIR_NAME') ?? 'Chair',
  };
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return env.NODE_ENV !== 'production';
}

export function getWeatherApiKey(): string | undefined {
  return optional('METOFFICE_API_KEY') ?? optional('WEATHER_API_KEY');
}

export function getPublicMapApiKey(): string | undefined {
  return optional('PUBLIC_MAP_API_KEY');
}

export function getBlobToken(): string | undefined {
  return optional('BLOB_READ_WRITE_TOKEN');
}

/**
 * OpenRouteService key for geocoding and walking routes. Server-only: never
 * expose it to islands. OPENROUTESERVICE_API_KEY (the name used in issue #5)
 * is accepted as a fallback.
 */
export function getOrsApiKey(): string | undefined {
  return optional('ORS_API_KEY') ?? optional('OPENROUTESERVICE_API_KEY');
}
