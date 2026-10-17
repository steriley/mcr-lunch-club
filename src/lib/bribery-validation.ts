import { z } from 'zod';

export const briberyInputSchema = z.object({
  venueId: z.string().uuid().nullable().optional().transform((value) => value ?? null),
  venueNameText: z.string().trim().max(200).optional().default(''),
  incidentDate: z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    return String(value);
  }, z.string().datetime({ offset: true }).nullable().optional().transform((value) => value ? new Date(value) : null)),
  description: z.string().trim().min(10, 'A description of the incident is required.').max(2000),
  outcome: z.string().trim().max(2000).optional().default(''),
  published: z.boolean().optional().default(true),
});

export function briberyErrorResponse(error: unknown) {
  if (error instanceof z.ZodError) {
    const fieldErrors: Record<string, string> = {};
    error.issues.forEach((issue) => {
      const field = issue.path[0] ? String(issue.path[0]) : 'form';
      fieldErrors[field] = issue.message;
    });

    return Response.json({ error: 'Validation failed.', fields: fieldErrors }, { status: 400 });
  }

  return Response.json({ error: 'Unable to process this bribery record right now.' }, { status: 400 });
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
