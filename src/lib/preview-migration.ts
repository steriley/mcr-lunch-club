/**
 * Decides whether a build may apply migrations. Only Vercel Preview builds
 * migrate, and only once the database is shown not to be production: the
 * Neon integration gives each preview its own branch, but if Preview branching
 * is off the preview build sees the production connection string instead.
 */
export type PreviewMigrationDecision =
  | { run: false; reason: string }
  | { run: true; host: string };

/** Neon endpoint id of a host or connection string, e.g. `ep-cool-darkness-123456`. */
export function neonEndpointId(value: string): string {
  const host = value.includes('://') ? new URL(value).hostname : value.trim();
  return host.split('.')[0].replace(/-pooler$/, '').toLowerCase();
}

export function decidePreviewMigration(env: Record<string, string | undefined>): PreviewMigrationDecision {
  if (env.VERCEL_ENV !== 'preview') {
    return { run: false, reason: `not a Vercel preview build (VERCEL_ENV=${env.VERCEL_ENV ?? 'unset'})` };
  }

  const url = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'No DATABASE_URL_UNPOOLED or DATABASE_URL in this preview build. Turn on Preview branching in the Neon integration.'
    );
  }

  const productionHost = env.PRODUCTION_DATABASE_HOST?.trim();
  if (!productionHost) {
    throw new Error(
      'PRODUCTION_DATABASE_HOST is not set, so this preview build cannot prove it is not using the production ' +
        'database. Set it in Vercel (Preview environment) to the production Neon host.'
    );
  }

  const host = new URL(url).hostname;
  if (neonEndpointId(host) === neonEndpointId(productionHost)) {
    throw new Error(
      'This preview build is connected to the production database. Turn on Preview branching in the Neon ' +
        'integration so each preview gets its own branch.'
    );
  }

  return { run: true, host };
}
