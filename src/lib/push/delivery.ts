/**
 * Sending one push and reading the push service's answer (#115). The sender is passed in, so
 * tests use a fake one; src/lib/push/web-push-sender.ts is the real one.
 */
import type { DeliveryOptions } from '@/lib/push/messages';

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** The push service's HTTP status, or null when no answer came (timeout, network). */
export interface SendResult {
  statusCode: number | null;
  /** Seconds, from a 429 or 503's Retry-After. */
  retryAfter?: number;
  error?: string;
}

export type PushSender = (
  target: PushTarget,
  payload: string,
  options: DeliveryOptions & { topic?: string }
) => Promise<SendResult>;

export type DeliveryOutcome =
  | 'delivered'
  /** 404/410: the subscription is gone for good, so it is deleted. */
  | 'gone'
  /** 413: the payload is too big. A bug, since payloads are kept well under the limit. */
  | 'too_large'
  /** 429/5xx: worth one retry. */
  | 'retry'
  | 'failed';

export function classifyResult(result: SendResult): DeliveryOutcome {
  const status = result.statusCode;
  if (status === null) return 'failed';
  if (status >= 200 && status < 300) return 'delivered';
  if (status === 404 || status === 410) return 'gone';
  if (status === 413) return 'too_large';
  if (status === 429 || status >= 500) return 'retry';
  return 'failed';
}

/** The short pause before the one retry; a Retry-After is honoured up to a few seconds. */
const RETRY_DELAY_MS = 1000;
const RETRY_DELAY_MAX_MS = 5000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends, retrying once on 429/5xx after a short backoff. Never throws: a sender that throws counts
 * as a failure. The final outcome is never `retry`.
 */
export async function sendWithRetry(
  send: PushSender,
  target: PushTarget,
  payload: string,
  options: DeliveryOptions & { topic?: string },
  sleep: (ms: number) => Promise<unknown> = wait
): Promise<{ outcome: Exclude<DeliveryOutcome, 'retry'>; result: SendResult }> {
  const attempt = async (): Promise<SendResult> => {
    try {
      return await send(target, payload, options);
    } catch (error) {
      return { statusCode: null, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  let result = await attempt();
  if (classifyResult(result) === 'retry') {
    const delay = Math.min(
      RETRY_DELAY_MAX_MS,
      result.retryAfter ? result.retryAfter * 1000 : RETRY_DELAY_MS
    );
    await sleep(delay);
    result = await attempt();
  }
  const outcome = classifyResult(result);
  return { outcome: outcome === 'retry' ? 'failed' : outcome, result };
}

/**
 * A Web Push `Topic` for a notification tag: the push service then keeps only the newest
 * undelivered push per topic. Topics are at most 32 URL-safe characters, so the tag is hashed.
 */
export async function topicFor(tag: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(tag));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);
}
