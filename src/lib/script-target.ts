import { neonEndpointId } from '@/lib/deploy-migration';

/**
 * Which database a script is about to use, and whether it may write to it.
 * Scripts read `DATABASE_URL_UNPOOLED` (then `DATABASE_URL`) from the shell or,
 * failing that, `.env.local`, so without this a run can quietly hit a different
 * database from the one intended. `vercel env run -e production` does not help:
 * sensitive variables are not passed on, and the script falls back to `.env.local`.
 *
 * Rules:
 * - `--production` is a statement of intent: it is refused unless the target
 *   really is production (so a silent fall back to the dev database stops the
 *   run instead of writing there).
 * - A write to production needs `--production`.
 * - Without `PRODUCTION_DATABASE_HOST`, production cannot be told from any other
 *   Neon database, so only a local database may be written to.
 * - `--dry-run` never writes, so it needs no flag.
 */
export type ScriptTarget = { proceed: boolean; message: string };

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function checkScriptTarget(
  env: Record<string, string | undefined>,
  options: { writes: boolean; confirmedProduction: boolean }
): ScriptTarget {
  const url = env.DATABASE_URL_UNPOOLED?.trim() || env.DATABASE_URL?.trim();
  if (!url) {
    return { proceed: false, message: 'No DATABASE_URL_UNPOOLED or DATABASE_URL is set.' };
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return { proceed: false, message: 'The database URL is not a valid URL.' };
  }
  const productionHost = env.PRODUCTION_DATABASE_HOST?.trim();
  const local = LOCAL_HOSTS.has(host.toLowerCase());
  const production = !!productionHost && neonEndpointId(host) === neonEndpointId(productionHost);

  if (options.confirmedProduction && !production) {
    return {
      proceed: false,
      message: productionHost
        ? `Database: ${host} (not production). --production was passed, so this run was stopped. Check the URL: ` +
          'the production URL must be passed explicitly (a sensitive Vercel variable is not read by `vercel env run`).'
        : `Database: ${host}. --production was passed but PRODUCTION_DATABASE_HOST is not set, so production cannot be confirmed.`,
    };
  }
  if (production) {
    if (options.writes && !options.confirmedProduction) {
      return {
        proceed: false,
        message: `Database: ${host} is PRODUCTION. Pass --production to write to it (--dry-run needs no flag).`,
      };
    }
    return { proceed: true, message: `Database: ${host} (PRODUCTION)` };
  }
  if (!productionHost) {
    if (options.writes && !local) {
      return {
        proceed: false,
        message:
          `Database: ${host}. PRODUCTION_DATABASE_HOST is not set, so this cannot be told from production, ` +
          'and only a local database may be written to without it. Set it to the production Neon host (`.env.local` is fine).',
      };
    }
    return {
      proceed: true,
      message: local
        ? `Database: ${host} (local)`
        : `Database: ${host} (cannot tell whether this is production: set PRODUCTION_DATABASE_HOST)`,
    };
  }
  return { proceed: true, message: `Database: ${host} (${local ? 'local, ' : ''}not production)` };
}
