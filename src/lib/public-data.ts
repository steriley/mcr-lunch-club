import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import {
  briberyRecords,
  goldenCut,
  inspections,
  venueImages,
  venues,
  type BriberyRow,
  type InspectionRow,
  type VenueImageRow,
  type VenueRow,
} from '@/db/schema';
import { publicPersonName, publicText } from '@/lib/bribery';
import { cuisineLabel } from '@/lib/cuisines';
import { formatDateTime } from '@/lib/dates';
import { db } from '@/lib/db';
import type { TierValue } from '@/lib/tiers';
import type { CostBand } from '@/lib/venue-schema';
import { sortForPublic } from '@/lib/venue-order';
import { isMappable, isPubliclyVisible } from '@/lib/visibility';
import { publicVenueCondition } from '@/lib/visibility-sql';
import type { Incident, Inspection, PublicImage, Venue } from '@/types';

/**
 * Read-only queries for the public site. Venues are filtered with the shared
 * visibility rule (src/lib/visibility.ts) and mapped to public shapes that
 * carry no admin-only fields. The public pages are prerendered, so these run
 * when the site is built; admin saves trigger a rebuild (src/lib/rebuild.ts).
 */

function coordinateLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(6)}%2C${longitude.toFixed(6)}`;
}

/** A venue as shown on the public site. */
export type PublicVenue = Venue & {
  image: PublicImage | null;
  /** Permanently closed; only Gone But Not Forgotten venues are public while closed. */
  closed: boolean;
};

/** A row that passed the visibility rule, so it has an approved tier. */
type PublicRow = VenueRow & { tier: TierValue };

/**
 * Only the primary photo is joined, and only inside queries already limited
 * by publicVenueCondition(), so a hidden venue never exposes an image.
 */
const primaryImage = and(eq(venueImages.venueId, venues.id), eq(venueImages.isPrimary, true));

/** Public fields only: no uploader, no ids. */
export function toPublicImage(image: VenueImageRow | null, venueName: string): PublicImage | null {
  if (!image) return null;
  return {
    url: image.fullUrl,
    thumbUrl: image.thumbUrl ?? image.fullUrl,
    width: image.width,
    height: image.height,
    alt: image.caption?.trim() || venueName,
    focalX: image.focalX,
    focalY: image.focalY,
  };
}

export function toPublicVenue(row: PublicRow, image: VenueImageRow | null = null): PublicVenue {
  const lat = row.latitude === null ? null : Number(row.latitude);
  const lng = row.longitude === null ? null : Number(row.longitude);
  const hasCoordinates = lat !== null && lng !== null;

  return {
    id: row.slug,
    name: row.name,
    slug: row.slug,
    tier: row.tier,
    lat,
    lng,
    distanceMiles: row.distanceMiles === null ? null : Number(row.distanceMiles),
    walkingTimeMin: row.walkingTimeMin,
    cost: row.cost as CostBand,
    cuisine: cuisineLabel(row.cuisine),
    eatLikeUs: row.lunchSpecial ?? '',
    lastInspectionDate: row.lastInspectionDate ?? 'Awaiting Assessment',
    address: row.address ?? '',
    mapSearchLink:
      row.mapSearchLink ??
      (hasCoordinates
        ? coordinateLink(lat, lng)
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${row.name} Manchester`)}`),
    image: toPublicImage(image, row.name),
    closed: row.closedAt !== null,
  };
}

/** Public venue page extras that the list views don't need. */
export interface PublicVenueDetail extends PublicVenue {
  pullQuote: string | null;
  /** The venue's own website as the Chairs entered it; null when none. */
  websiteUrl: string | null;
}

function isPublicRow(row: VenueRow): row is PublicRow {
  return isPubliclyVisible(row);
}

interface VenueWithImage {
  venue: VenueRow;
  image: VenueImageRow | null;
}

function publicVenueRows() {
  return db
    .select({ venue: venues, image: venueImages })
    .from(venues)
    .leftJoin(venueImages, primaryImage);
}

const toPublic = ({ venue, image }: VenueWithImage) => toPublicVenue(venue as PublicRow, image);

/** Every public venue, grouped by tier and in each tier's public order (src/lib/venue-order.ts). */
export async function getPublicVenues(): Promise<PublicVenue[]> {
  const rows: VenueWithImage[] = await publicVenueRows()
    .where(publicVenueCondition())
    .orderBy(asc(venues.name));
  return sortForPublic(
    rows.filter(({ venue }) => isPublicRow(venue)).map(toPublic),
    (venue) => venue.tier
  );
}

/**
 * Venues for the map, Near Me and the other home page islands: public and
 * still open. Closed venues stay off the map even when their tier page lists them.
 */
export async function getMapVenues(): Promise<PublicVenue[]> {
  const rows: VenueWithImage[] = await publicVenueRows()
    .where(publicVenueCondition())
    .orderBy(asc(venues.name));
  return sortForPublic(
    rows.filter(({ venue }) => isPublicRow(venue) && isMappable(venue)).map(toPublic),
    (venue) => venue.tier
  );
}

const toPublicDetail = (row: VenueWithImage): PublicVenueDetail => ({
  ...toPublic(row),
  pullQuote: row.venue.pullQuote,
  websiteUrl: row.venue.websiteUrl,
});

export async function getPublicVenue(slug: string): Promise<PublicVenueDetail | null> {
  const [row]: VenueWithImage[] = await publicVenueRows()
    .where(and(eq(venues.slug, slug), publicVenueCondition()))
    .limit(1);
  if (!row || !isPublicRow(row.venue)) return null;
  return toPublicDetail(row);
}

/** Every public venue with its detail fields, for building the venue pages in one query. */
export async function getPublicVenueDetails(): Promise<PublicVenueDetail[]> {
  const rows: VenueWithImage[] = await publicVenueRows()
    .where(publicVenueCondition())
    .orderBy(asc(venues.name));
  return rows.filter(({ venue }) => isPublicRow(venue)).map(toPublicDetail);
}

/** A Golden Cut venue for the home page, in position order (the first is the hero). */
export interface GoldenCutVenue {
  venue: PublicVenue;
  /** The Chairs' write-up; falls back to the venue's pull quote. */
  puffPiece: string | null;
  /** The dish to order; falls back to the venue's lunch special. */
  anchorDish: string | null;
}

/**
 * The Golden Cut, skipping any venue that is no longer Approved or no longer
 * on the map, so the next one moves up rather than leaving a gap.
 */
export async function getGoldenCut(): Promise<GoldenCutVenue[]> {
  const rows = await db
    .select({ entry: goldenCut, venue: venues, image: venueImages })
    .from(goldenCut)
    .innerJoin(venues, eq(goldenCut.venueId, venues.id))
    .leftJoin(venueImages, primaryImage)
    .where(and(publicVenueCondition(), eq(venues.tier, 'approved')))
    .orderBy(asc(goldenCut.position));
  return rows
    .filter(({ venue }) => isPublicRow(venue) && isMappable(venue) && venue.tier === 'approved')
    .map(({ entry, venue, image }) => ({
      venue: toPublicVenue(venue as PublicRow, image),
      puffPiece: entry.puffPiece ?? venue.pullQuote,
      anchorDish: entry.anchorDish ?? venue.lunchSpecial,
    }));
}

export function toPublicInspection(
  inspection: Pick<
    InspectionRow,
    'id' | 'inspectionDate' | 'kind' | 'outcome' | 'firstAdminName' | 'secondAdminName'
  >,
  venue: Pick<VenueRow, 'slug' | 'name'>
): Inspection {
  return {
    id: inspection.id,
    venueSlug: venue.slug,
    venueName: venue.name,
    date: inspection.inspectionDate,
    kind: inspection.kind,
    outcome: inspection.kind === 'verified' ? inspection.outcome : null,
    chairs:
      inspection.kind === 'verified'
        ? [
            inspection.firstAdminName ?? 'Former Chair',
            inspection.secondAdminName ?? 'Former Chair',
          ]
        : [],
  };
}

/** Confirmed inspections (verified or legacy) of public venues. Pending and lapsed presses never show. */
function publicInspectionCondition(venueSlug?: string) {
  return and(
    eq(inspections.status, 'confirmed'),
    publicVenueCondition(),
    venueSlug === undefined ? undefined : eq(venues.slug, venueSlug)
  );
}

/** Public inspections, newest first; all of them, or one venue's. */
export async function getPublicInspections(venueSlug?: string): Promise<Inspection[]> {
  const rows = await db
    .select({ inspection: inspections, venue: venues })
    .from(inspections)
    .innerJoin(venues, eq(inspections.venueId, venues.id))
    .where(publicInspectionCondition(venueSlug))
    .orderBy(desc(inspections.inspectionDate), sql`${inspections.confirmedAt} desc nulls last`);
  return rows
    .filter(({ venue }) => isPublicRow(venue))
    .map(({ inspection, venue }) => toPublicInspection(inspection, venue));
}

/** For the nav badge on every public page. */
export async function countPublicInspections(): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(inspections)
    .innerJoin(venues, eq(inspections.venueId, venues.id))
    .where(publicInspectionCondition());
  return row?.total ?? 0;
}

let buildInspectionCount: Promise<number> | undefined;

/** countPublicInspections, run once and shared by every page prerendered in a build. */
export function countPublicInspectionsForBuild(): Promise<number> {
  return (buildInspectionCount ??= countPublicInspections());
}

/** For the Tiers nav badge: every venue the public site lists, across all tiers. */
export async function countPublicVenues(): Promise<number> {
  const [row] = await db.select({ total: count() }).from(venues).where(publicVenueCondition());
  return row?.total ?? 0;
}

let buildVenueCount: Promise<number> | undefined;

/** countPublicVenues, run once and shared by every page prerendered in a build. */
export function countPublicVenuesForBuild(): Promise<number> {
  return (buildVenueCount ??= countPublicVenues());
}

/** e.g. "8th Jul 26, 09:00": the incident's calendar day plus its recorded time, if any. */
export function formatIncidentDate(date: string | null, time: string | null): string | undefined {
  if (!date) return undefined;
  return formatDateTime(date, { time });
}

export function toPublicIncident(row: BriberyRow): Incident {
  return {
    id: row.id,
    date: row.incidentDate ?? '',
    ...(row.incidentTime ? { time: row.incidentTime } : {}),
    ...(row.incidentDate
      ? { formattedDate: formatIncidentDate(row.incidentDate, row.incidentTime) }
      : {}),
    ...(row.location || row.venueNameText
      ? { location: row.location ?? row.venueNameText ?? undefined }
      : {}),
    title: row.title ?? 'Improper benefit attempt',
    peopleInvolved: row.peopleInvolved.map(publicPersonName),
    witnesses: row.witnesses.map(publicPersonName),
    benefitOffered: row.benefitOffered ?? '',
    value: row.value ?? '',
    context: publicText(row.description),
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
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
