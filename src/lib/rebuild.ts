import { getDeployHookUrl } from '@/lib/env';

export type RebuildResult = 'accepted' | 'refused' | 'unreachable';

/**
 * The public pages are prerendered, so a change only reaches them when the
 * site is rebuilt. This asks Vercel for a rebuild through the Deploy Hook in
 * DEPLOY_HOOK_URL. It never throws: the change it follows has already been
 * saved. `refused` means Vercel answered with an error; `unreachable` means
 * there was no answer (no hook configured, a network failure or the timeout).
 * A timeout does not mean no build: Vercel can still start one.
 */
export async function requestRebuild(
  reason: string,
  { timeoutMs }: { timeoutMs: number }
): Promise<RebuildResult> {
  const url = getDeployHookUrl();
  if (!url) return 'unreachable';
  try {
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(timeoutMs) });
    if (response.ok) return 'accepted';
    // The hook URL is a credential, so only the reason and status are logged.
    console.error(`Rebuild after "${reason}" was refused with status ${response.status}.`);
    return 'refused';
  } catch (error) {
    console.error(
      `Rebuild after "${reason}" could not be requested:`,
      error instanceof Error ? error.message : error
    );
    return 'unreachable';
  }
}
