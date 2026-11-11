import '@/lib/zod-browser';
import { z } from 'zod';

/**
 * Member display names (#136): their shape and how they compare. Browser-safe, so the profile form
 * checks the same rules before it sends anything. The profanity filter is server-only
 * (src/lib/members/display-name-filter.ts) and never ships to the browser.
 */

const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 30;

/** Letters (any script), digits, spaces, apostrophes, hyphens and full stops. */
const ALLOWED = /^[\p{L}\p{M}\p{N}' ’.-]+$/u;
const HAS_LETTER = /\p{L}/u;

/** The name as it is stored and shown: Unicode-normalised, trimmed, single spaces. */
function normaliseDisplayName(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/**
 * What uniqueness compares: the normalised name in lower case, with curly apostrophes made
 * straight, so "Sam O’Brien" and "sam o'brien" are the same name.
 */
export function displayNameKey(name: string): string {
  return normaliseDisplayName(name).replace(/’/g, "'").toLowerCase();
}

export const displayNameSchema = z
  .string()
  .transform(normaliseDisplayName)
  .pipe(
    z
      .string()
      .min(DISPLAY_NAME_MIN, `Use at least ${DISPLAY_NAME_MIN} characters.`)
      .max(DISPLAY_NAME_MAX, `Use ${DISPLAY_NAME_MAX} characters or fewer.`)
      .regex(ALLOWED, 'Use letters, numbers, spaces, apostrophes, hyphens and full stops only.')
      .regex(HAS_LETTER, 'Include at least one letter.')
  );

/** PATCH /api/member/profile: change the name, the privacy setting, or both. */
export const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    showPublicly: z.boolean().optional(),
  })
  .refine((value) => value.displayName !== undefined || value.showPublicly !== undefined, {
    message: 'Nothing to change.',
  });

export type ProfileUpdate = z.output<typeof profileUpdateSchema>;
