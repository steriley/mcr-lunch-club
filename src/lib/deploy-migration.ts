/**
 * Decides whether a Vercel build applies migrations. Production builds migrate
 * the production database; preview builds migrate their own Neon branch, but
 * only once it is shown not to be production: if Preview branching is off in
 * the Neon integration, a preview build sees the production connection string.
 * Local and other builds never migrate.
 */
export type DeployMigrationDecision =
  { run: false; reason: string } | { run: true; target: 'production' | 'preview'; host: string };

/** Neon endpoint id of a host or connection string, e.g. `ep-cool-darkness-123456`. */
export function neonEndpointId(value: string): string {
  const host = value.includes('://') ? new URL(value).hostname : value.trim();
  return host
    .split('.')[0]
    .replace(/-pooler$/, '')
    .toLowerCase();
}

export function decideDeployMigration(
  env: Record<string, string | undefined>
): DeployMigrationDecision {
  const target = env.VERCEL_ENV;
  if (target !== 'production' && target !== 'preview') {
    return {
      run: false,
      reason: `not a Vercel production or preview build (VERCEL_ENV=${target ?? 'unset'})`,
    };
  }

  const url = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      target === 'preview'
        ? 'No DATABASE_URL_UNPOOLED or DATABASE_URL in this preview build. Turn on Preview branching in the Neon integration.'
        : 'No DATABASE_URL_UNPOOLED or DATABASE_URL in this production build.'
    );
  }
  const host = new URL(url).hostname;

  if (target === 'production') {
    return { run: true, target, host };
  }

  const productionHost = env.PRODUCTION_DATABASE_HOST?.trim();
  if (!productionHost) {
    throw new Error(
      'PRODUCTION_DATABASE_HOST is not set, so this preview build cannot prove it is not using the production ' +
        'database. Set it in Vercel (Preview environment) to the production Neon host.'
    );
  }

  if (neonEndpointId(host) === neonEndpointId(productionHost)) {
    throw new Error(
      'This preview build is connected to the production database. Turn on Preview branching in the Neon ' +
        'integration so each preview gets its own branch.'
    );
  }

  return { run: true, target, host };
}
