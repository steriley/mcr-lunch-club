/**
 * The browser side of the JSON API's `{ error, fields? }` contract
 * (jsonError in src/lib/admin-api.ts), used by the admin islands and the
 * public suggestion form. It never throws (except when the caller aborts),
 * so there is no try/catch or JSON parsing at the call site.
 */

export type ApiFetchResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** The server's message, else `fallback` (or `offline` when the request never got an answer). */
      error: string;
      /** Per-field messages from a validation error; empty otherwise. */
      fields: Record<string, string>;
    };

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Sent as JSON, or as-is when it is FormData. */
  body?: unknown;
  signal?: AbortSignal;
  /** Shown when the server gives no message. */
  fallback: string;
  /** Shown when the request fails without a response; defaults to `fallback`. */
  offline?: string;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: ApiFetchOptions
): Promise<ApiFetchResult<T>> {
  const { method = 'GET', body, signal, fallback, offline = fallback } = options;
  const isForm = body instanceof FormData;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') throw error;
    return { ok: false, error: offline, fields: {} };
  }

  const result = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: result as T };
  return {
    ok: false,
    error: typeof result?.error === 'string' && result.error ? result.error : fallback,
    fields: result?.fields && typeof result.fields === 'object' ? result.fields : {},
  };
}

/** Field messages joined into one line, else the error: for forms that show a single message. */
export function failureText(result: { error: string; fields: Record<string, string> }): string {
  const fields = Object.values(result.fields).join(' ');
  return fields || result.error;
}
