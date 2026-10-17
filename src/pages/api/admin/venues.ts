export const prerender = false;

import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { adminGuard, venueErrorResponse, venueInputSchema } from '@/lib/venue-validation';

const { venues } = schema;

export async function GET({ request }: { request: Request }) {
  const session = await adminGuard(request);
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const tier = url.searchParams.get('tier');
  const query = url.searchParams.get('query') ?? '';

  const rows = await db.select().from(venues).orderBy(desc(venues.updatedAt));
  const filtered = rows.filter((venue) => {
    const matchesTier = !tier || venue.tier === tier;
    const haystack = `${venue.name} ${venue.slug} ${venue.address ?? ''}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query.toLowerCase());
    return matchesTier && matchesQuery;
  });

  return Response.json({ venues: filtered });
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

  const parsed = venueInputSchema.safeParse(body);
  if (!parsed.success) {
    return venueErrorResponse(parsed.error);
  }

  const data = parsed.data;
  const existing = await db.query.venues.findFirst({ where: eq(venues.slug, data.slug) });
  if (existing) {
    return Response.json({ error: 'Slug already exists. Choose a unique slug.', fields: { slug: 'Slug already exists.' } }, { status: 409 });
  }

  const [row] = await (db.insert(venues as any).values({
    name: data.name,
    slug: data.slug,
    tier: data.tier,
    address: data.address || null,
    latitude: data.latitude as any,
    longitude: data.longitude as any,
    summary: data.summary || null,
    verdict: data.verdict || null,
    pullQuote: data.pullQuote || null,
    lunchSpecial: data.lunchSpecial || null,
    websiteUrl: data.websiteUrl || null,
    imageUrl: data.imageUrl || null,
    published: data.published,
    updatedBy: session.user.id,
  }) as any).returning();

  return Response.json({ venue: row }, { status: 201 });
}
