import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { briberyRecords, venues, type BriberyRow, type VenueRow } from '@/db/schema';
import { db } from '@/lib/db';
import { tierLabel } from '@/lib/tiers';
import type { CostBand } from '@/lib/venue-schema';
import { distanceFromBaseMiles, estimateWalkingMinutes } from '@/lib/venues';
import type { Incident, Venue } from '@/types';

/**
 * Read-only queries for the public site. Only published rows are ever
 * returned, and rows are mapped to the same shapes the static JSON used,
 * so existing pages and islands render unchanged.
 */

/** CDN caching for public pages: fresh for 60s, then served stale while revalidating. */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export function setPublicCacheHeaders(headers: Headers): void {
  headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
}

function coordinateLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)}%2C${longitude.toFixed(6)}`;
}

/** A published venue; optional fields of `Venue` are always present here. */
export type PublishedVenue = Venue & { notes: string; evidenceUrl: string; rejectionReason: string | null };

export function toPublicVenue(row: VenueRow): PublishedVenue {
  const lat = row.latitude === null ? null : Number(row.latitude);
  const lng = row.longitude === null ? null : Number(row.longitude);
  const hasCoordinates = lat !== null && lng !== null;
  const distanceMiles =
    row.distanceMiles !== null ? Number(row.distanceMiles) : hasCoordinates ? distanceFromBaseMiles(lat, lng) : 0;

  return {
    id: row.slug,
    name: row.name,
    slug: row.slug,
    status: tierLabel(row.tier),
    rank: row.rank,
    lat,
    lng,
    distanceMiles,
    walkingTimeMin: row.walkingTimeMin ?? estimateWalkingMinutes(distanceMiles),
    cost: row.cost as CostBand,
    cuisine: row.cuisine ?? '',
    eatLikeUs: row.lunchSpecial ?? '',
    lastInspectionDate: row.lastInspectionDate ?? 'Awaiting Assessment',
    rejectionReason: row.rejectionReason,
    address: row.address ?? '',
    evidenceUrl: row.websiteUrl ?? '',
    mapSearchLink:
      row.mapSearchLink ??
      (hasCoordinates
        ? coordinateLink(lat, lng)
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.name} Manchester`)}`),
    notes: row.summary ?? '',
  };
}

/** Public venue page extras that the list views don't need. */
export interface PublicVenueDetail extends PublishedVenue {
  pullQuote: string | null;
  verdict: string | null;
  imageUrl: string | null;
}

// Same order as the original content: tier, Approved rank, then display order.
const publicOrder = [asc(venues.tier), sql`${venues.rank} asc nulls last`, asc(venues.sortOrder), asc(venues.name)];

export async function getPublishedVenues(): Promise<PublishedVenue[]> {
  const rows = await db.select().from(venues).where(eq(venues.published, true)).orderBy(...publicOrder);
  return rows.map(toPublicVenue);
}

export async function getPublishedVenue(slug: string): Promise<PublicVenueDetail | null> {
  const [row] = await db
    .select()
    .from(venues)
    .where(and(eq(venues.slug, slug), eq(venues.published, true)))
    .limit(1);
  if (!row) return null;
  return { ...toPublicVenue(row), pullQuote: row.pullQuote, verdict: row.verdict, imageUrl: row.imageUrl };
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th'}`;
}

/** e.g. "8th July 2026 at 9am", matching the original Hall of Shame entries. */
export function formatIncidentDate(date: string | null, time: string | null): string | undefined {
  if (!date) return undefined;
  const [year, month, day] = date.split('-').map(Number);
  const monthName = new Date(Date.UTC(year, month - 1, day)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });
  let text = `${ordinal(day)} ${monthName} ${year}`;
  if (time) {
    const [hours, minutes] = time.split(':').map(Number);
    const suffix = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    text += ` at ${hour12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${suffix}`;
  }
  return text;
}

export function toPublicIncident(row: BriberyRow): Incident {
  return {
    id: row.id,
    date: row.incidentDate ?? '',
    ...(row.incidentTime ? { time: row.incidentTime } : {}),
    ...(row.incidentDate ? { formattedDate: formatIncidentDate(row.incidentDate, row.incidentTime) } : {}),
    ...(row.location || row.venueNameText ? { location: row.location ?? row.venueNameText ?? undefined } : {}),
    title: row.title ?? 'Improper benefit attempt',
    peopleInvolved: row.peopleInvolved,
    witnesses: row.witnesses,
    benefitOffered: row.benefitOffered ?? '',
    value: row.value ?? '',
    context: row.description,
    outcome: row.outcome ?? '',
  };
}

export async function getPublishedIncidents(): Promise<Incident[]> {
  const rows = await db
    .select()
    .from(briberyRecords)
    .where(eq(briberyRecords.published, true))
    .orderBy(sql`${briberyRecords.incidentDate} desc nulls last`, desc(briberyRecords.createdAt));
  return rows.map(toPublicIncident);
}

/** JSON for embedding in a <script type="application/json"> tag. */
export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
