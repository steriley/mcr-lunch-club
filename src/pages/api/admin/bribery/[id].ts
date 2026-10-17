export const prerender = false;

import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { adminGuard, briberyErrorResponse, briberyInputSchema } from '@/lib/bribery-validation';

const { briberyRecords, venues } = schema;

export async function GET({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'Bribery id is required.' }, { status: 400 });
  }

  const record = await db.query.briberyRecords.findFirst({ where: eq(briberyRecords.id, id) });
  if (!record) {
    return Response.json({ error: 'Bribery record not found.' }, { status: 404 });
  }

  return Response.json({ bribery: record });
}

export async function PUT({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'Bribery id is required.' }, { status: 400 });
  }

  const current = await db.query.briberyRecords.findFirst({ where: eq(briberyRecords.id, id) });
  if (!current) {
    return Response.json({ error: 'Bribery record not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Request body is required.' }, { status: 400 });
  }

  const parsed = briberyInputSchema.safeParse(body);
  if (!parsed.success) {
    return briberyErrorResponse(parsed.error);
  }

  const data = parsed.data;
  let venueNameText = data.venueNameText?.trim() ?? '';
  if (data.venueId) {
    const venue = await db.query.venues.findFirst({ where: eq(venues.id, data.venueId) });
    if (!venue) {
      return Response.json({ error: 'Venue not found.', fields: { venueId: 'Please select a valid venue.' } }, { status: 404 });
    }
    venueNameText = venue.name;
  }

  const [row] = await (db.update(briberyRecords as any)
    .set({
      venueId: data.venueId ?? null,
      venueNameText: venueNameText || null,
      incidentDate: data.incidentDate ?? null,
      description: data.description,
      outcome: data.outcome || null,
      published: data.published,
      updatedAt: new Date(),
    })
    .where(eq(briberyRecords.id, id)) as any)
    .returning();

  return Response.json({ bribery: row });
}

export async function DELETE({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'Bribery id is required.' }, { status: 400 });
  }

  const existing = await db.query.briberyRecords.findFirst({ where: eq(briberyRecords.id, id) });
  if (!existing) {
    return Response.json({ error: 'Bribery record not found.' }, { status: 404 });
  }

  await db.delete(briberyRecords).where(eq(briberyRecords.id, id));
  return Response.json({ ok: true });
}
