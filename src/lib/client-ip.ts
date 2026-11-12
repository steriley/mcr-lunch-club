/**
 * The client's IP for the public forms' rate limits, or null when the host can't say.
 *
 * Astro's `clientAddress` getter (on Vercel, the validated `x-forwarded-for` that Vercel itself
 * overwrites) throws where the host can't supply one, so it is read lazily. There is no fallback
 * to a request header: off Vercel the client writes those, and a spoofed address per request would
 * give every request its own rate-limit bucket.
 */
export function clientIp(readClientAddress: () => string): string | null {
  try {
    return readClientAddress() || null;
  } catch {
    return null;
  }
}
