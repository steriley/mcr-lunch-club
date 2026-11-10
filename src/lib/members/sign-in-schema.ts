import '@/lib/zod-browser';
import { z } from 'zod';

/** The member sign-in request (#136), shared with the sign-in form (PR c). Browser-safe. */
export const signInRequestSchema = z.object({
  email: z
    .email({ error: 'Enter a valid email address.' })
    .trim()
    .toLowerCase()
    .max(254, 'Enter a valid email address.'),
  /** The time-trap token from GET /api/member/sign-in. */
  formToken: z.string().max(200),
  /** Honeypot: hidden from people, so anything in it means a bot. */
  website: z.string().max(200).optional(),
});
