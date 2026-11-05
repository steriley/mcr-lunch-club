import { neonEndpointId } from '@/lib/deploy-migration';

/**
 * Which database a script is about to use, and whether it may write to it.
 * Scripts read `DATABASE_URL_UNPOOLED` (then `DATABASE_URL`) from the shell or,
 * failing that, `.env.local`, so without this a run can quietly hit a different
 * database from the one intended. `vercel env run -e production` does not help:
 * sensitive variables are not passed on, and the script falls back to `.env.local`.
 */
export type ScriptTarget = { proceed: boolean; message: string };

export function checkScriptTarget(
  env: Record<string, string | undefined>,
  options: { writes: boolean; confirmedProduction: boolean }
): ScriptTarget {
  const url = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim();
  if (!url) {
    return { proceed: false, message: 'No DATABASE_URL_UNPOOLED or DATABASE_URL is set.' };
  }
  const host = new URL(url).hostname;
  const productionHost = env.PRODUCTION_DATABASE_HOST?.trim();

  if (!productionHost) {
    return {
      proceed: true,
      message: `Database: ${host} (cannot tell whether this is production: set PRODUCTION_DATABASE_HOST to the production Neon host)`,
    };
  }
  if (neonEndpointId(host) !== neonEndpointId(productionHost)) {
    return { proceed: true, message: `Database: ${host} (not production)` };
  }
  if (options.writes && !options.confirmedProduction) {
    return {
      proceed: false,
      message: `Database: ${host} is PRODUCTION. Pass --production to write to it (--dry-run needs no flag).`,
    };
  }
  return { proceed: true, message: `Database: ${host} (PRODUCTION)` };
}
