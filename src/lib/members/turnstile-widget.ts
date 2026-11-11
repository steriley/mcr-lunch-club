/**
 * Cloudflare Turnstile in the browser (#136, PR d): loads Cloudflare's script only when the member
 * sign-in form opens, so no other page pays for it. The hosts it needs are in `security.csp`
 * (astro.config.mjs): script-src, frame-src and connect-src.
 */

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: 'auto';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    }
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (api) resolve(api);
      else reject(new Error('Turnstile did not start.'));
    };
    script.onerror = () => reject(new Error('Turnstile did not load.'));
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = null; // let the next attempt try again
    throw error;
  });
  return loading;
}

export interface TurnstileHandlers {
  /** A fresh single-use token. */
  onToken(token: string): void;
  /** The token expired or the widget failed: there is no usable token any more. */
  onLost(): void;
}

export interface TurnstileHandle {
  /** Asks for a new token: each one works for a single request. */
  reset(): void;
  remove(): void;
}

export async function mountTurnstile(
  container: HTMLElement,
  siteKey: string,
  handlers: TurnstileHandlers
): Promise<TurnstileHandle> {
  const api = await loadTurnstile();
  const id = api.render(container, {
    sitekey: siteKey,
    theme: 'auto',
    callback: handlers.onToken,
    'expired-callback': handlers.onLost,
    'error-callback': handlers.onLost,
  });
  return { reset: () => api.reset(id), remove: () => api.remove(id) };
}
