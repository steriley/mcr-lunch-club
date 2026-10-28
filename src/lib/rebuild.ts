import { getDeployHookUrl } from '@/lib/env';

/**
 * The public pages are prerendered, so a change only reaches them when the
 * site is rebuilt. This asks Vercel for a rebuild through the Deploy Hook in
 * DEPLOY_HOOK_URL, and does nothing without one. It never throws: the change
 * it follows has already been saved. Returns whether Vercel accepted the request.
 */
export async function requestRebuild(reason: string): Promise<boolean> {
  const url = getDeployHookUrl();
  if (!url) return false;
  try {
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(5_000) });
    if (response.ok) return true;
    // The hook URL is a credential, so only the reason and status are logged.
    console.error(`Rebuild after "${reason}" was refused with status ${response.status}.`);
  } catch (error) {
    console.error(
      `Rebuild after "${reason}" could not be requested:`,
      error instanceof Error ? error.message : error
    );
  }
  return false;
}
