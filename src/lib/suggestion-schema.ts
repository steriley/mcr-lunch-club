import { z } from 'zod';
import { COST_BANDS } from '@/lib/venue-schema';

/**
 * Public "Suggest a Venue" input, shared by the public API and SuggestModal.
 * Keep this module free of server-only imports so it can ship to the browser.
 */

const emptyToNull = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).nullable()
  );

export const suggestionInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Give the venue’s name.')
    .max(200, 'Venue name must be 200 characters or fewer.'),
  address: z
    .string()
    .trim()
    .min(3, 'Give an address or street.')
    .max(255, 'Address must be 255 characters or fewer.'),
  cuisine: optionalText(120, 'Cuisine'),
  cost: z.preprocess(emptyToNull, z.enum(COST_BANDS, { error: 'Choose a cost band.' }).nullable()),
  recommendedOrder: optionalText(500, 'Recommended order'),
  rationale: z
    .string()
    .trim()
    .min(10, 'Tell the Chairs why (at least 10 characters).')
    .max(2000, 'Keep it under 2000 characters.'),
  submitterName: optionalText(120, 'Your name'),
  // Honeypot: hidden from people, so anything here came from a bot.
  website: z.string().optional(),
});

export const SUGGESTION_STATUSES = ['new', 'accepted', 'dismissed'] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const suggestionStatusSchema = z.object({ status: z.enum(['new', 'dismissed']) });
