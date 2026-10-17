export const prerender = false;

import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { adminGuard, venueErrorResponse, venueInputSchema } from '@/lib/venue-validation';

const { venues } = schema;

export async function GET({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'Venue id is required.' }, { status: 400 });
  }

  const venue = await db.query.venues.findFirst({ where: eq(venues.id, id) });
  if (!venue) {
    return Response.json({ error: 'Venue not found.' }, { status: 404 });
  }

  return Response.json({ venue });
}

export async function PUT({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'Venue id is required.' }, { status: 400 });
  }

  const current = await db.query.venues.findFirst({ where: eq(venues.id, id) });
  if (!current) {
    return Response.json({ error: 'Venue not found.' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: 'Request body is required.' }, { status: 400 });
  }

  const parsed = venueInputSchema.safeParse(body);
  if (!parsed.success) {
    return venueErrorResponse(parsed.error);
  }

  const data = parsed.data;
  const duplicate = await db.query.venues.findFirst({ where: eq(venues.slug, data.slug) });
  if (duplicate && duplicate.id !== id) {
    return Response.json({ error: 'Slug already exists. Choose a unique slug.', fields: { slug: 'Slug already exists.' } }, { status: 409 });
  }

  const [row] = await (db.update(venues as any)
    .set({
      name: data.name,
      slug: data.slug,
      tier: data.tier,
      address: data.address || null,
      latitude: (data.latitude ?? null) as any,
      longitude: (data.longitude ?? null) as any,
      summary: data.summary || null,
      verdict: data.verdict || null,
      pullQuote: data.pullQuote || null,
      lunchSpecial: data.lunchSpecial || null,
      websiteUrl: data.websiteUrl || null,
      imageUrl: data.imageUrl || null,
      published: data.published,
      updatedBy: session.user.id,
      updatedAt: new Date(),
    })
    .where(eq(venues.id, id)) as any)
    .returning();

  return Response.json({ venue: row });
}

export async function DELETE({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;
  if (!id) {
    return Response.json({ error: 'Venue id is required.' }, { status: 400 });
  }

  const current = await db.query.venues.findFirst({ where: eq(venues.id, id) });
  if (!current) {
    return Response.json({ error: 'Venue not found.' }, { status: 404 });
  }

  await db.delete(venues).where(eq(venues.id, id));
  return Response.json({ ok: true });
}
