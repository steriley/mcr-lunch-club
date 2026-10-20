import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { briberyRecords } from '@/db/schema';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, validationError } from '@/lib/admin-api';
import { briberyInputSchema } from '@/lib/bribery-schema';
import { briberyValues, serializeBribery } from '@/lib/bribery';
import { db } from '@/lib/db';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  try {
    const rows = await db.select().from(briberyRecords).orderBy(desc(briberyRecords.incidentDate), desc(briberyRecords.createdAt));
    return jsonResponse({ records: rows.map(serializeBribery) });
  } catch (error) {
    return serverError('List bribery records', error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const parsed = briberyInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await briberyValues(db, parsed.data);
    if (!result.ok) return jsonError(400, 'Please correct the highlighted fields.', { venueId: result.error });

    const [row] = await db
      .insert(briberyRecords)
      .values({ ...result.values, createdBy: session.user.email })
      .returning();
    return jsonResponse({ record: serializeBribery(row) }, 201);
  } catch (error) {
    return serverError('Create bribery record', error);
  }
};
