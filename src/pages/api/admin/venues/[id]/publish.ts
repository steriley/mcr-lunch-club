export const prerender = false;

import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { adminGuard } from '@/lib/venue-validation';

const { venues } = schema;

export async function POST({ params, request }: { params: Record<string, string | undefined>; request: Request }) {
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

  const [row] = await db.update(venues)
    .set({ published: true, updatedAt: new Date(), updatedBy: session.user.id })
    .where(eq(venues.id, id))
    .returning();

  return Response.json({ venue: row });
}
