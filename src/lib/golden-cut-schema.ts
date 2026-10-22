import { z } from 'zod';

/**
 * The Golden Cut input, shared by the admin API and the editor island.
 * Keep this module free of server-only imports so it can ship to the browser.
 */

/** Most venues The Golden Cut holds; position 1 is the hero. */
export const GOLDEN_CUT_SIZE = 5;
export const PUFF_PIECE_MAX = 600;
export const ANCHOR_DISH_MAX = 120;

const optionalText = (max: number, label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value ?? null),
    z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).nullable()
  );

export const goldenCutEntrySchema = z.object({
  venueId: z.uuid('Choose a venue.'),
  puffPiece: optionalText(PUFF_PIECE_MAX, 'Puff piece'),
  anchorDish: optionalText(ANCHOR_DISH_MAX, 'Anchor dish'),
});

/** The whole list, in display order. Saving replaces whatever was there. */
export const goldenCutInputSchema = z.object({
  entries: z
    .array(goldenCutEntrySchema)
    .max(GOLDEN_CUT_SIZE, `The Golden Cut holds at most ${GOLDEN_CUT_SIZE} venues.`)
    .refine((entries) => new Set(entries.map((entry) => entry.venueId)).size === entries.length, 'Each venue can only appear once.'),
});

export type GoldenCutEntryInput = z.infer<typeof goldenCutEntrySchema>;
