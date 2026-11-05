import { asc, count, desc, eq, not } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { briberyRecords, tierProposals, venueSuggestions, venues } from '@/db/schema';
import { serializeBribery } from '@/lib/bribery';
import { formatDate } from '@/lib/dates';
import type { Database } from '@/lib/db-client';
import { listGoldenCut, notShownReason } from '@/lib/golden-cut';
import {
  describeInspection,
  getVisitStatus,
  latestVerifiedInspection,
  listPendingInspections,
} from '@/lib/inspections';
import { londonDate } from '@/lib/london-date';
import { routeStatus } from '@/lib/route-status';
import type { SuggestionStatus } from '@/lib/suggestion-schema';
import { serializeSuggestion, suggestionPrefill } from '@/lib/suggestions';
import {
  countActiveAdmins,
  pendingProposalForVenue,
  serializeProposal,
} from '@/lib/tier-proposals';
import { loadVenueTimeline, toTimelineView } from '@/lib/venue-history';
import { listVenueImages, serializeVenueImage } from '@/lib/venue-images';
import { serializeVenue } from '@/lib/venues';
import { listVisitsForVenue } from '@/lib/visits';
import { hiddenReason, isPubliclyVisible } from '@/lib/visibility';
import { publicVenueCondition } from '@/lib/visibility-sql';

/**
 * Read models for the Chairs' Area pages (#111). Each returns typed,
 * display-ready data, so a page keeps its auth check and markup and holds no
 * query of its own. Admin-only: the dossier carries decline reasons and
 * visits, which no public page may touch (src/test/public-safety.test.ts).
 */

export interface Viewer {
  id: string;
  name?: string | null;
  email: string;
}

// ---- Dashboard -------------------------------------------------------------

export async function loadDashboard(db: Database, viewerId: string) {
  const [hidden, recent, [suggestions], [pendingChanges]] = await Promise.all([
    db
      .select({ id: venues.id, name: venues.name, tier: venues.tier, updatedAt: venues.updatedAt })
      .from(venues)
      .where(not(publicVenueCondition()))
      .orderBy(desc(venues.updatedAt))
      .limit(10),
    db
      .select({
        id: venues.id,
        name: venues.name,
        tier: venues.tier,
        latitude: venues.latitude,
        longitude: venues.longitude,
        closedAt: venues.closedAt,
        updatedAt: venues.updatedAt,
        editor: user.name,
      })
      .from(venues)
      .leftJoin(user, eq(user.id, venues.updatedBy))
      .orderBy(desc(venues.updatedAt))
      .limit(8),
    db.select({ total: count() }).from(venueSuggestions).where(eq(venueSuggestions.status, 'new')),
    db.select({ total: count() }).from(tierProposals).where(eq(tierProposals.status, 'pending')),
  ]);
  const pendingInspections = await listPendingInspections(db, viewerId);

  return {
    awaitingCountersign: pendingChanges.total + pendingInspections.length,
    newSuggestions: suggestions.total,
    recent: recent.map((venue) => ({
      id: venue.id,
      name: venue.name,
      updatedAt: venue.updatedAt,
      editor: venue.editor,
      hidden: !isPubliclyVisible(venue),
    })),
    hidden,
  };
}

// ---- Venues ----------------------------------------------------------------

export async function loadVenueList(db: Database) {
  const rows = await db
    .select({
      id: venues.id,
      name: venues.name,
      slug: venues.slug,
      tier: venues.tier,
      latitude: venues.latitude,
      longitude: venues.longitude,
      distanceMiles: venues.distanceMiles,
      closedAt: venues.closedAt,
      lastInspectionDate: venues.lastInspectionDate,
      walkingTimeMin: venues.walkingTimeMin,
      routeUpdatedAt: venues.routeUpdatedAt,
      updatedAt: venues.updatedAt,
    })
    .from(venues)
    .orderBy(asc(venues.name));
  return rows.map(
    ({
      latitude,
      longitude,
      distanceMiles,
      walkingTimeMin,
      routeUpdatedAt,
      closedAt,
      ...venue
    }) => ({
      ...venue,
      hiddenReason: hiddenReason({ tier: venue.tier, latitude, longitude, closedAt }),
      closed: closedAt !== null,
      routeStatus: routeStatus({
        latitude,
        longitude,
        distanceMiles,
        walkingTimeMin,
        routeUpdatedAt,
      }),
      updatedAt: venue.updatedAt.toISOString(),
    })
  );
}

/** Id and name of every venue: the bribery forms' venue picker. */
export function loadVenueOptions(db: Database) {
  return db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(asc(venues.name));
}

/** The history page's heading: null when the venue does not exist. */
async function loadVenueName(db: Database, venueId: string) {
  const [venue] = await db
    .select({ id: venues.id, name: venues.name })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return venue ?? null;
}

export async function loadVenueHistory(db: Database, venueId: string) {
  const venue = await loadVenueName(db, venueId);
  if (!venue) return null;
  return { venue, timeline: await loadVenueTimeline(db, venue.id) };
}

async function nameOf(db: Database, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [found] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return found ? found.name || found.email : null;
}

/**
 * Everything the venue page shows: the form's venue, its photos and the
 * dossier. Null when the venue does not exist. A person who has since left
 * shows as "a former admin".
 */
export async function loadVenueDossier(db: Database, venueId: string, viewer: Viewer) {
  const [row] = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  if (!row) return null;

  const [
    editorName,
    closerName,
    visitStatus,
    timeline,
    pendingProposal,
    verifiedInspection,
    activeAdmins,
    images,
    visits,
  ] = await Promise.all([
    nameOf(db, row.updatedBy),
    nameOf(db, row.closedBy),
    getVisitStatus(db, row.id, viewer.id),
    loadVenueTimeline(db, row.id),
    pendingProposalForVenue(db, row.id),
    latestVerifiedInspection(db, row.id),
    countActiveAdmins(db),
    listVenueImages(db, row.id),
    // Every Chair's visits and notes: any active Chair reads them all (src/lib/visits.ts).
    listVisitsForVenue(db, row.id),
  ]);

  const closedText = row.closedAt
    ? `Permanently closed: marked on ${formatDate(row.closedAt)}${closerName ? ` by ${closerName}` : ''}. Off the map and Near Me${
        row.tier === 'gone_but_not_forgotten'
          ? '; still listed under Gone But Not Forgotten.'
          : '; hidden from the public site.'
      }`
    : null;

  return {
    venue: serializeVenue(row),
    updatedByName: editorName,
    images: images.map(serializeVenueImage),
    dossier: {
      currentTier: row.tier,
      currentUserId: viewer.id,
      currentUserName: viewer.name || viewer.email,
      visitStatus,
      latestVerifiedInspection: verifiedInspection
        ? `${formatDate(verifiedInspection.inspectionDate)}, ${describeInspection(verifiedInspection).replace(/^V/, 'v')}`
        : null,
      pendingMotion: pendingProposal ? serializeProposal(pendingProposal) : null,
      motionVisits: pendingProposal?.inspectionId
        ? visits.filter((visit) => visit.inspectionId === pendingProposal.inspectionId)
        : [],
      activeAdmins,
      visits,
      today: londonDate(),
      closed: row.closedAt !== null,
      closedText,
      timeline: timeline.map(toTimelineView),
    },
  };
}

// ---- Suggestions -----------------------------------------------------------

export async function loadSuggestions(db: Database, status: SuggestionStatus) {
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(venueSuggestions)
      .where(eq(venueSuggestions.status, status))
      .orderBy(desc(venueSuggestions.createdAt))
      .limit(200),
    db
      .select({ status: venueSuggestions.status, total: count() })
      .from(venueSuggestions)
      .groupBy(venueSuggestions.status),
  ]);
  return {
    suggestions: rows.map(serializeSuggestion),
    totals: new Map(counts.map((row) => [row.status, row.total])),
  };
}

/** The new-venue form's prefill, or null when the suggestion is gone, taken or dismissed. */
export async function loadSuggestionPrefill(db: Database, suggestionId: string) {
  const [suggestion] = await db
    .select()
    .from(venueSuggestions)
    .where(eq(venueSuggestions.id, suggestionId))
    .limit(1);
  return suggestion && suggestion.status === 'new' && !suggestion.venueId
    ? suggestionPrefill(suggestion)
    : null;
}

// ---- Golden Cut ------------------------------------------------------------

export async function loadGoldenCutEditor(db: Database) {
  const [entries, approved] = await Promise.all([
    listGoldenCut(db),
    db
      .select({
        id: venues.id,
        name: venues.name,
        tier: venues.tier,
        latitude: venues.latitude,
        longitude: venues.longitude,
        closedAt: venues.closedAt,
      })
      .from(venues)
      .where(eq(venues.tier, 'approved'))
      .orderBy(asc(venues.name)),
  ]);
  return {
    entries,
    approvedVenues: approved.map((venue) => ({
      id: venue.id,
      name: venue.name,
      notShownReason: notShownReason(venue),
    })),
  };
}

// ---- Bribery ---------------------------------------------------------------

export function loadBriberyRecords(db: Database) {
  return db
    .select({
      id: briberyRecords.id,
      title: briberyRecords.title,
      venueNameText: briberyRecords.venueNameText,
      incidentDate: briberyRecords.incidentDate,
      description: briberyRecords.description,
      published: briberyRecords.published,
    })
    .from(briberyRecords)
    .orderBy(desc(briberyRecords.incidentDate), desc(briberyRecords.createdAt));
}

export async function loadBriberyRecord(db: Database, id: string) {
  const [record] = await db.select().from(briberyRecords).where(eq(briberyRecords.id, id)).limit(1);
  return record ? serializeBribery(record) : null;
}
