import { z } from 'zod';

/** Request bodies for the Chairs' push API (src/pages/api/admin/push). */

const base64url = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9_-]+=*$/, 'Must be base64url.');

const pushEndpoint = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be an https: URL.');

export const pushSubscriptionSchema = z.object({
  endpoint: pushEndpoint,
  keys: z.object({ p256dh: base64url, auth: base64url }),
  label: z.string().trim().max(60).optional(),
  /** The endpoint this one replaces, after a key rotation or `pushsubscriptionchange`. */
  oldEndpoint: pushEndpoint.optional(),
});

export type PushSubscriptionInput = z.output<typeof pushSubscriptionSchema>;

export const removeSubscriptionSchema = z.union([
  z.object({ endpoint: pushEndpoint }),
  z.object({ id: z.uuid() }),
]);

export const preferencesSchema = z
  .object({
    proposals: z.boolean(),
    decisions: z.boolean(),
    visits: z.boolean(),
    suggestions: z.boolean(),
    contact: z.boolean(),
    promptDismissed: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to change.');
