import { z } from 'zod';

/** Bribery / Improper Benefit Attempt Record input, shared by the API and BriberyForm. */

const emptyToNull = (value: unknown) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
};

const optionalText = (max: number, label: string) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `${label} must be ${max} characters or fewer.`).nullable());

/** Accepts an array or a newline/comma separated string. */
const nameList = (label: string) =>
  z.preprocess(
    (value) => {
      const items = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
      return items.map((item) => String(item).trim()).filter(Boolean);
    },
    z.array(z.string().max(120, `Each name in ${label} must be 120 characters or fewer.`)).max(30, `List at most 30 ${label}.`)
  );

export const briberyInputSchema = z.object({
  title: z.string().trim().min(2, 'A title is required.').max(200, 'Title must be 200 characters or fewer.'),
  venueId: z.preprocess(emptyToNull, z.uuid({ error: 'Choose a venue from the list.' }).nullable()),
  venueNameText: optionalText(200, 'Venue name'),
  incidentDate: z.preprocess(emptyToNull, z.iso.date({ error: 'Use a valid date.' }).nullable()),
  incidentTime: z.preprocess(emptyToNull, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time such as 12:30.').nullable()),
  location: optionalText(200, 'Location'),
  peopleInvolved: nameList('people involved'),
  witnesses: nameList('witnesses'),
  benefitOffered: optionalText(500, 'Benefit offered'),
  value: optionalText(60, 'Value'),
  description: z.string().trim().min(10, 'Describe the incident (at least 10 characters).').max(5000, 'Description must be 5000 characters or fewer.'),
  outcome: optionalText(5000, 'Outcome'),
  published: z.boolean().default(true),
});

export type BriberyInput = z.output<typeof briberyInputSchema>;

export const briberyPublishSchema = z.object({ published: z.boolean() });
