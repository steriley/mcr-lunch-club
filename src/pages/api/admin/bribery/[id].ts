import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { briberyRecords } from '@/db/schema';
import { jsonError, jsonResponse, readJson, requireAdmin, serverError, uuidParam, validationError } from '@/lib/admin-api';
import { briberyInputSchema, briberyPublishSchema } from '@/lib/bribery-schema';
import { briberyValues, serializeBribery } from '@/lib/bribery';
import { db } from '@/lib/db';

export const prerender = false;

const notFound = () => jsonError(404, 'Bribery record not found.');

export const GET: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return notFound();

  try {
    const [row] = await db.select().from(briberyRecords).where(eq(briberyRecords.id, id.data)).limit(1);
    return row ? jsonResponse({ record: serializeBribery(row) }) : notFound();
  } catch (error) {
    return serverError('Load bribery record', error);
  }
};

export const PUT: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return notFound();

  const parsed = briberyInputSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await briberyValues(db, parsed.data);
    if (!result.ok) return jsonError(400, 'Please correct the highlighted fields.', { venueId: result.error });

    const [row] = await db.update(briberyRecords).set(result.values).where(eq(briberyRecords.id, id.data)).returning();
    return row ? jsonResponse({ record: serializeBribery(row) }) : notFound();
  } catch (error) {
    return serverError('Update bribery record', error);
  }
};

/** Publish or unpublish without resending the whole record. */
export const PATCH: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return notFound();

  const parsed = briberyPublishSchema.safeParse(await readJson(request));
  if (!parsed.success) return validationError(parsed.error);

  try {
    const [row] = await db
      .update(briberyRecords)
      .set({ published: parsed.data.published, updatedAt: new Date() })
      .where(eq(briberyRecords.id, id.data))
      .returning();
    return row ? jsonResponse({ record: serializeBribery(row) }) : notFound();
  } catch (error) {
    return serverError('Publish bribery record', error);
  }
};

export const DELETE: APIRoute = async ({ request, params }) => {
  const session = await requireAdmin(request);
  if (session instanceof Response) return session;

  const id = uuidParam.safeParse(params.id);
  if (!id.success) return notFound();

  try {
    const [row] = await db.delete(briberyRecords).where(eq(briberyRecords.id, id.data)).returning({ id: briberyRecords.id });
    return row ? jsonResponse({ ok: true }) : notFound();
  } catch (error) {
    return serverError('Delete bribery record', error);
  }
};
