import { ne, sql } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { memberInspections } from '@/db/schema';

/**
 * SQL fragments about a member's logs, shared by the People's Inspections operations
 * (src/lib/member-inspections.ts) and the People's score (src/lib/public-scores.ts), so both
 * count eligibility, weights and bans the same way.
 */

/** How many days the log's member has logged (and not had removed) at the log's venue. */
export const daysAtVenue = sql<number>`(
  select count(*)::int from ${memberInspections} as "other"
  where "other"."member_id" = ${memberInspections.memberId}
    and "other"."venue_id" = ${memberInspections.venueId}
    and "other"."status" <> 'removed'
)`;

/** How many different venues the log's member has logged at, for their weight. */
export const venuesLogged = sql<number>`(
  select count(distinct "w"."venue_id")::int from ${memberInspections} as "w"
  where "w"."member_id" = ${memberInspections.memberId}
    and "w"."status" <> 'removed'
)`;

export const notRemoved = ne(memberInspections.status, 'removed');

/**
 * The log's member is not banned now (the rule in `isBanned`, src/lib/roles.ts). A banned
 * member's logs leave the public feed and the people's score, and come back if the ban is lifted.
 */
export const notBanned = sql`not exists (
  select 1 from ${user} as "banned_member"
  where "banned_member"."id" = ${memberInspections.memberId}
    and "banned_member"."banned"
    and ("banned_member"."ban_expires" is null or "banned_member"."ban_expires" > now())
)`;
