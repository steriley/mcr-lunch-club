import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db-script';
import { schema } from '@/db/drizzle-schema';
import { normalizeTier, slugify } from '@/lib/venue-utils';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const sourceFile = Array.from(args).find((value) => !value.startsWith('--')) ?? 'src/data/venues.json';

const { venues } = schema;
const filePath = path.resolve(sourceFile);
const raw = fs.readFileSync(filePath, 'utf8');
const data = JSON.parse(raw) as Array<Record<string, unknown>>;

const displayStatusMap: Record<string, string> = {
  Approved: 'approved',
  'Under Consideration': 'under_consideration',
  'To Be Assessed': 'to_be_assessed',
  Rejected: 'rejected',
  'If We Must': 'if_we_must',
  'Gone But Not Forgotten': 'gone_but_not_forgotten',
};

const rows = await Promise.all(
  data.map(async (venue) => {
    const existing = await db.query.venues.findFirst({ where: eq(venues.slug, String(venue.slug ?? slugify(String(venue.name ?? '')))) });
    return {
      existing,
      payload: {
        name: String(venue.name ?? '').trim(),
        slug: String(venue.slug ?? slugify(String(venue.name ?? ''))),
        tier: normalizeTier(String(venue.status ?? displayStatusMap[String(venue.status ?? '')] ?? 'approved')),
        address: typeof venue.address === 'string' ? venue.address.trim() : null,
        latitude: venue.lat != null ? Number(venue.lat) : null,
        longitude: venue.lng != null ? Number(venue.lng) : null,
        summary: typeof venue.notes === 'string' ? venue.notes.trim() : null,
        verdict: typeof venue.eatLikeUs === 'string' ? venue.eatLikeUs.trim() : null,
        pullQuote: typeof venue.notes === 'string' && venue.notes.trim() ? venue.notes.trim().slice(0, 220) : null,
        lunchSpecial: typeof venue.cuisine === 'string' ? venue.cuisine.trim() : null,
        websiteUrl: typeof venue.evidenceUrl === 'string' && venue.evidenceUrl ? venue.evidenceUrl : null,
        imageUrl: null,
        published: true,
        updatedBy: null,
      },
    };
  })
);

if (dryRun) {
  console.log(`Dry run: ${rows.length} venues would be imported from ${filePath}.`);
  process.exit(0);
}

for (const row of rows) {
  if (row.existing) {
    await (db.update(venues as any).set({
      ...row.payload,
      updatedAt: new Date(),
    }) as any).where(eq(venues.id, row.existing.id));
    continue;
  }

  await (db.insert(venues as any).values({
    ...row.payload,
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as any);
}

console.log(`Imported ${rows.length} venues.`);
