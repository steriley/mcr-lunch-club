import { flagsClient, Reason } from '@vercel/flags-core';

/**
 * A boolean Vercel Flags flag, failing closed: anything but a literal `true` is off, including no
 * credentials (local dev without `vercel env pull`), an unknown flag and an unreachable Flags
 * service. On Vercel the client authenticates with the deployment's OIDC token and evaluates the
 * flag for the deployment's environment; elsewhere it uses the `FLAGS` SDK key if one is set.
 */
export async function isFlagOn(key: string): Promise<boolean> {
  try {
    const result = await flagsClient.evaluate(key, false);
    return result.reason !== Reason.ERROR && result.value === true;
  } catch {
    return false;
  }
}
