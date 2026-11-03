import webpush from 'web-push';
import type { PushEnvironment } from '@/lib/env';
import type { PushSender } from '@/lib/push/delivery';

/** Per request, so one slow push service cannot hold up the others. */
const SEND_TIMEOUT_MS = 8000;

/** The real sender: VAPID-signed Web Push with the `web-push` package. No third-party service. */
export function webPushSender(keys: PushEnvironment): PushSender {
  return async (target, payload, options) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Push request timed out.')), SEND_TIMEOUT_MS);
    });
    try {
      const response = await Promise.race([
        webpush.sendNotification(target, payload, {
          vapidDetails: keys,
          TTL: options.ttl,
          urgency: options.urgency,
          topic: options.topic,
          // The standard encoding; Apple's push service accepts no other.
          contentEncoding: 'aes128gcm',
          timeout: SEND_TIMEOUT_MS,
        }),
        timeout,
      ]);
      return { statusCode: response.statusCode };
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        const retryAfter = Number(error.headers?.['retry-after']);
        return {
          statusCode: error.statusCode,
          retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
          error: `push service answered ${error.statusCode}`,
        };
      }
      return { statusCode: null, error: error instanceof Error ? error.message : 'Unknown error' };
    } finally {
      clearTimeout(timer);
    }
  };
}
