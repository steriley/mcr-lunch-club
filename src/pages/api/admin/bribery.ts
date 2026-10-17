export const prerender = false;

import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { adminGuard, briberyErrorResponse, briberyInputSchema } from '@/lib/bribery-validation';

const { briberyRecords, venues } = schema;

export async function GET({ request }: { request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get('query') ?? '').trim().toLowerCase();

  const rows = await db.select().from(briberyRecords).orderBy(desc(briberyRecords.updatedAt));
  const filtered = rows.filter((record) => {
    if (!query) return true;
    const haystack = `${record.venueNameText ?? ''} ${record.description ?? ''} ${record.outcome ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });

  return Response.json({ bribery: filtered });
}

export async function POST({ request }: { request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
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

  const [row] = await (db.insert(briberyRecords as any).values({
    venueId: data.venueId ?? null,
    venueNameText: venueNameText || null,
    incidentDate: data.incidentDate ?? null,
    description: data.description,
    outcome: data.outcome || null,
    published: data.published,
    createdBy: session.user.email,
  }) as any).returning();

  return Response.json({ bribery: row }, { status: 201 });
}
