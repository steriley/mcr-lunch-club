import { flagsClient, Reason } from '@vercel/flags-core';

/** The Vercel Flags flag behind the Christmas snowfall. Toggle it in the Vercel dashboard (Flags). */
const SNOW_FLAG = 'snow';

/**
 * Whether the snowfall is switched on. Anything but a literal `true` is off, including no
 * credentials (local dev without `vercel env pull`), an unknown flag and an unreachable Flags
 * service: the flag is decoration, so it fails closed. On Vercel the client authenticates with
 * the deployment's OIDC token and evaluates the flag for the deployment's environment; elsewhere
 * it uses the `FLAGS` SDK key if one is set.
 */
export async function isSnowEnabled(): Promise<boolean> {
  try {
    const result = await flagsClient.evaluate(SNOW_FLAG, false);
    return result.reason !== Reason.ERROR && result.value === true;
  } catch {
    return false;
  }
}
