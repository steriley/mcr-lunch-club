import { z } from 'zod';

export const tierEnumValues = [
  'approved',
  'under_consideration',
  'to_be_assessed',
  'rejected',
  'if_we_must',
  'gone_but_not_forgotten',
] as const;

const validTiers = [...tierEnumValues] as const;

export const venueInputSchema = z.object({
  name: z.string().trim().min(2, 'Venue name is required.').max(200),
  slug: z.string().trim().min(2, 'Slug is required.').max(120).regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers and hyphens.'),
  tier: z.string().refine((value) => validTiers.includes(value as (typeof validTiers)[number]), { message: 'Please choose a valid tier.' }),
  address: z.string().trim().max(255).optional().default(''),
  latitude: z.union([z.number(), z.string()]).nullish().transform((value) => {
    if (value === null || value === undefined || value === '') return null;
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }).refine((value) => value === null || (value >= 53 && value <= 54), 'Latitude should look like a Manchester location.'),
  longitude: z.union([z.number(), z.string()]).nullish().transform((value) => {
    if (value === null || value === undefined || value === '') return null;
    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }).refine((value) => value === null || (value >= -3 && value <= -1), 'Longitude should look like a Manchester location.'),
  summary: z.string().trim().max(2000).optional().default(''),
  verdict: z.string().trim().max(5000).optional().default(''),
  pullQuote: z.string().trim().max(400).optional().default(''),
  lunchSpecial: z.string().trim().max(400).optional().default(''),
  websiteUrl: z.preprocess((value) => (value === '' ? null : value), z.string().url('Website URL must be a valid URL.').nullable().optional()),
  imageUrl: z.preprocess((value) => (value === '' ? null : value), z.string().url('Image URL must be a valid URL.').nullable().optional()),
  published: z.boolean().optional().default(false),
});

export function venueErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    error.issues.forEach((issue) => {
      const field = issue.path[0] ? String(issue.path[0]) : 'form';
      fieldErrors[field] = issue.message;
    });

    return Response.json({ error: 'Validation failed.', fields: fieldErrors }, { status: 400 });
  }

  return Response.json({ error: 'Unable to process this venue right now.' }, { status: 400 });
}

export function adminGuard(request: Request) {
  return import('@/lib/auth').then(async ({ auth }) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session || !session.user || session.user.role !== 'admin') {
      return null;
    }
    return session;
  });
}
