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

export function getAuthEnvironment() {
  const secret = required('BETTER_AUTH_SECRET');
  if (secret.length < 32) {
    throw new Error('Invalid environment variable: BETTER_AUTH_SECRET must be at least 32 characters long.');
  }

  return {
    secret,
    url: validateAuthUrl(required('BETTER_AUTH_URL')),
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
