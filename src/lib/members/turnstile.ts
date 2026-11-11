import { getTurnstileEnvironment } from '@/lib/env';

/**
 * Cloudflare Turnstile for the member sign-in form (#136, PR d): the server side. The widget on the
 * form gives the browser a single-use token; the route sends it to Cloudflare's `siteverify`
 * before it spends any of the rate-limit allowance or makes an email.
 */

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const MAX_TOKEN_LENGTH = 2048;
const VERIFY_TIMEOUT_MS = 5000;

/** `unavailable`: no secret key, or Cloudflare couldn't be asked. Both fail closed. */
export type TurnstileResult = 'ok' | 'failed' | 'unavailable';

/** The network call, swapped out by the route tests. */
export const turnstileTransport = {
  post: (body: URLSearchParams): Promise<Response> =>
    fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    }),
};

export async function verifyTurnstile(
  token: unknown,
  remoteIp: string | null
): Promise<TurnstileResult> {
  const { secretKey } = getTurnstileEnvironment();
  if (!secretKey) return 'unavailable';
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) return 'failed';

  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  try {
    const response = await turnstileTransport.post(body);
    if (!response.ok) return 'unavailable';
    const result = (await response.json()) as { success?: boolean };
    return result.success === true ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}
