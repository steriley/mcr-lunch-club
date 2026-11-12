import { createHmac, timingSafeEqual } from 'node:crypto';
import { getAuthEnvironment } from '@/lib/env';

/**
 * The time trap for the public forms (member sign-in #136, contact #132): the form fetches a
 * signed timestamp when it opens and sends it back. A submit within MIN_FORM_MS is a bot (the
 * caller answers as if it worked); after MAX_FORM_MS the form must be reloaded.
 *
 * Each form has its own purpose, so a token from one is no good on the other. The key is derived
 * from BETTER_AUTH_SECRET with that purpose, so the secret is never used directly and no new
 * variable is needed.
 */
export const MIN_FORM_MS = 3 * 1000;
export const MAX_FORM_MS = 2 * 60 * 60 * 1000;

type FormTokenResult = 'ok' | 'too_fast' | 'expired' | 'invalid';

export interface FormTokens {
  issue(now?: Date): string;
  check(token: unknown, now?: Date): FormTokenResult;
}

export function formTokens(purpose: string): FormTokens {
  const signature = (issuedAt: number) => {
    const key = createHmac('sha256', getAuthEnvironment().secret).update(purpose).digest();
    return createHmac('sha256', key).update(String(issuedAt)).digest('hex');
  };

  return {
    issue(now = new Date()) {
      const issuedAt = now.getTime();
      return `${issuedAt}.${signature(issuedAt)}`;
    },

    check(token, now = new Date()) {
      if (typeof token !== 'string') return 'invalid';
      const [stamp, given] = token.split('.');
      const issuedAt = Number(stamp);
      if (!Number.isSafeInteger(issuedAt) || !given) return 'invalid';
      const expected = Buffer.from(signature(issuedAt));
      const actual = Buffer.from(given);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return 'invalid';
      const age = now.getTime() - issuedAt;
      if (age < 0) return 'invalid';
      if (age < MIN_FORM_MS) return 'too_fast';
      if (age > MAX_FORM_MS) return 'expired';
      return 'ok';
    },
  };
}
