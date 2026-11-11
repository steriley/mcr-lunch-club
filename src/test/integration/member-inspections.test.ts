import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { briberyRecords, memberInspections, memberProfiles } from '@/db/schema';
import { londonDate } from '@/lib/london-date';
import { memberInspectionInputSchema } from '@/lib/member-inspection-rules';
import { isEligible, memberInspectionsApi as api } from '@/lib/member-inspections';
import { memberAccounts } from '@/lib/members/profiles';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  violates,
} from './db';

/** People's Inspections (#137): the rules that need the database. */

const DAY = 24 * 60 * 60 * 1000;
/** Midday in London (GMT), a Wednesday. */
const NOON = new Date('2026-11-11T12:00:00Z');

async function createMember(id: string, joined = new Date('2026-01-01T00:00:00Z')) {
  const db = await testDb();
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    role: 'user',
    createdAt: joined,
    updatedAt: joined,
  });
  return id;
}

/** A log's input; `visitDate` defaults to the London day of `now`. */
function input(venueId: string, overrides: Record<string, unknown> = {}) {
  return memberInspectionInputSchema.parse({
    venueId,
    visitDate: '2026-11-11',
    dish: 'Steak pie',
    cost: '££',
    verdictVote: 'approve',
    pullQuote: null,
    ...overrides,
  });
}

/** Logs a lunch for the London day of `now` and expects it to save. */
async function log(memberId: string, venueId: string, now: Date, overrides = {}) {
  const visitDate = londonDate(now);
  const saved = await api.create(
    await testDb(),
    memberId,
    input(venueId, { visitDate, ...overrides }),
    now
  );
  assert.ok(saved.ok, `log for ${memberId} on ${visitDate}: ${!saved.ok && saved.error}`);
  return saved.value;
}

const statuses = async (venueId: string) =>
  (await testDb())
    .select({
      member: memberInspections.memberId,
      status: memberInspections.status,
      reason: memberInspections.heldReason,
    })
    .from(memberInspections)
    .where(eq(memberInspections.venueId, venueId));

describe('member inspections (database)', { skip: skipIntegration }, () => {
  let venue: string;

  beforeEach(async () => {
    await resetTestDb();
    await createAdmin('chair', 'Chair');
    venue = await createVenue('Chip Shop', { tier: 'approved' });
  });

  after(closeTestDb);

  describe('one lunch a day', () => {
    it('the database refuses a second log for the same member and day', async () => {
      const db = await testDb();
      const other = await createVenue('Pie Shop', { tier: 'approved' });
      await createMember('sam');
      const row = {
        memberId: 'sam',
        visitDate: '2026-11-11',
        dish: 'Pie',
        cost: '££' as const,
        verdictVote: 'if_we_must' as const,
      };
      await db.insert(memberInspections).values({ ...row, venueId: venue });
      // Across all venues, not per venue.
      await assert.rejects(
        db.insert(memberInspections).values({ ...row, venueId: other }),
        violates('member_inspections_one_per_member_day')
      );
    });

    it('the API refuses a second log for the day, and a second new log in one London day', async () => {
      const db = await testDb();
      const other = await createVenue('Pie Shop', { tier: 'approved' });
      await createMember('sam');
      await log('sam', venue, NOON);

      assert.deepEqual(await api.create(db, 'sam', input(other), NOON), {
        ok: false,
        error: 'already_logged_that_day',
      });
      // Back-filling yesterday the same afternoon is the rate limit.
      assert.deepEqual(
        await api.create(db, 'sam', input(other, { visitDate: '2026-11-10' }), NOON),
        { ok: false, error: 'daily_log_limit' }
      );
      // The next London day it's fine.
      const tomorrow = new Date(NOON.getTime() + DAY);
      assert.ok(
        (await api.create(db, 'sam', input(other, { visitDate: '2026-11-10' }), tomorrow)).ok
      );
    });

    it('a race for the same day ends with one log', async () => {
      const db = await testDb();
      await createMember('sam');
      const results = await Promise.all(
        [1, 2, 3].map(() => api.create(db, 'sam', input(venue), NOON))
      );
      assert.equal(results.filter((result) => result.ok).length, 1);
      assert.equal((await statuses(venue)).length, 1);
    });

    it('only takes days from the last week in London', async () => {
      const db = await testDb();
      await createMember('sam');
      for (const visitDate of ['2026-11-12', '2026-11-04']) {
        assert.deepEqual(await api.create(db, 'sam', input(venue, { visitDate }), NOON), {
          ok: false,
          error: 'visit_date_out_of_range',
        });
      }
    });
  });

  describe('the Two-Visit Rule, in London days', () => {
    it('is provisional after one day and eligible after two, across midnight and the clock change', async () => {
      const db = await testDb();
      await createMember('sam');
      // 23:30 BST on Saturday 24 October 2026; the clocks go back at 02:00 BST on the 25th.
      const saturdayNight = new Date('2026-10-24T22:30:00Z');
      const first = await log('sam', venue, saturdayNight);
      assert.equal(first.visitDate, '2026-10-24');
      assert.equal(first.provisional, true);
      assert.equal(await isEligible(db, 'sam', venue), false);

      // The same UTC day, but 00:30 BST on Sunday in London: a new day.
      const afterMidnight = new Date('2026-10-24T23:30:00Z');
      assert.deepEqual(
        await api.create(db, 'sam', input(venue, { visitDate: '2026-10-25' }), saturdayNight),
        { ok: false, error: 'visit_date_out_of_range' },
        'Sunday is not loggable on Saturday night'
      );
      const second = await log('sam', venue, afterMidnight);
      assert.equal(second.visitDate, '2026-10-25');
      assert.equal(second.provisional, false);
      assert.equal(await isEligible(db, 'sam', venue), true);
      // Both logs count now, the first included.
      const own = await api.listOwn(db, 'sam', afterMidnight);
      assert.deepEqual(
        own.map((row) => [row.visitDate, row.provisional]),
        [
          ['2026-10-25', false],
          ['2026-10-24', false],
        ]
      );

      // 01:10 GMT on Sunday, after the clocks went back: still Sunday, so the rate limit holds.
      const stillSunday = new Date('2026-10-25T01:10:00Z');
      const other = await createVenue('Pie Shop', { tier: 'approved' });
      assert.deepEqual(
        await api.create(db, 'sam', input(other, { visitDate: '2026-10-23' }), stillSunday),
        { ok: false, error: 'daily_log_limit' }
      );
    });

    it('a removed log does not count', async () => {
      const db = await testDb();
      await createMember('sam');
      const first = await log('sam', venue, NOON);
      await log('sam', venue, new Date(NOON.getTime() + DAY));
      assert.equal(await isEligible(db, 'sam', venue), true);
      assert.ok((await api.remove(db, { id: first.id, actorId: 'chair', reason: 'Spam' })).ok);
      assert.equal(await isEligible(db, 'sam', venue), false);
    });
  });

  describe('venues and members', () => {
    it('takes only public, open venues that are not Gone But Not Forgotten', async () => {
      const db = await testDb();
      await createMember('sam');
      const refused = [
        await createVenue('No Tier', { tier: null }),
        await createVenue('Closed', { tier: 'approved', closedAt: new Date() }),
        await createVenue('Gone', { tier: 'gone_but_not_forgotten', closedAt: new Date() }),
        await createVenue('Nowhere', { tier: 'approved', latitude: null, longitude: null }),
      ];
      for (const id of refused) {
        assert.deepEqual(await api.create(db, 'sam', input(id), NOON), {
          ok: false,
          error: 'venue_not_loggable',
        });
      }
      const offered = await api.listLoggableVenues(db);
      assert.deepEqual(
        offered.map((row) => row.id),
        [venue]
      );
    });

    it('refuses a Chair', async () => {
      assert.deepEqual(await api.create(await testDb(), 'chair', input(venue), NOON), {
        ok: false,
        error: 'member_not_found',
      });
    });

    it('filters offensive dishes and quotes', async () => {
      const db = await testDb();
      await createMember('sam');
      assert.deepEqual(await api.create(db, 'sam', input(venue, { dish: 'sh1t pie' }), NOON), {
        ok: false,
        error: 'dish_offensive',
      });
      assert.deepEqual(
        await api.create(db, 'sam', input(venue, { pullQuote: 'f u c k this place' }), NOON),
        { ok: false, error: 'quote_offensive' }
      );
      assert.ok(
        (await api.create(db, 'sam', input(venue, { pullQuote: 'Pie of the year' }), NOON)).ok
      );
    });
  });

  describe('on-site verification', () => {
    it('sets gps within 150 m and keeps no coordinates', async () => {
      const db = await testDb();
      await createMember('sam');
      await createMember('alex');
      // The venue is at 53.48, -2.25; about 100 m north, then about 1 km away.
      const near = await log('sam', venue, NOON, { position: { lat: 53.4809, lng: -2.25 } });
      const far = await log('alex', venue, NOON, { position: { lat: 53.49, lng: -2.25 } });
      assert.equal(near.verifiedOnSite, true);
      assert.equal(far.verifiedOnSite, false);

      const columns = await db.execute<{ column_name: string }>(
        sql`select column_name from information_schema.columns where table_name = 'member_inspections'`
      );
      const names = columns.rows.map((row) => row.column_name);
      assert.ok(names.includes('verification'));
      assert.ok(!names.some((name) => /lat|lng|lon|position|coord/.test(name)), names.join());
    });
  });

  describe('editing and deleting', () => {
    it('works for 24 hours, for the member only, and never on a removed log', async () => {
      const db = await testDb();
      await createMember('sam');
      await createMember('alex');
      const saved = await log('sam', venue, NOON);
      const change = { ...input(venue), dish: 'Fish and chips', verdictVote: 'reject' as const };

      const edited = await api.update(
        db,
        'sam',
        saved.id,
        change,
        new Date(NOON.getTime() + 23 * 3600_000)
      );
      assert.ok(edited.ok);
      assert.equal(edited.value.dish, 'Fish and chips');
      assert.equal(edited.value.visitDate, saved.visitDate);

      assert.deepEqual(await api.update(db, 'alex', saved.id, change, NOON), {
        ok: false,
        error: 'member_inspection_not_found',
      });
      assert.deepEqual(await api.delete(db, 'alex', saved.id, NOON), {
        ok: false,
        error: 'member_inspection_not_found',
      });
      const late = new Date(NOON.getTime() + DAY);
      assert.deepEqual(await api.update(db, 'sam', saved.id, change, late), {
        ok: false,
        error: 'edit_window_closed',
      });
      assert.deepEqual(await api.delete(db, 'sam', saved.id, late), {
        ok: false,
        error: 'edit_window_closed',
      });

      const other = await log('alex', venue, NOON);
      await api.remove(db, { id: other.id, actorId: 'chair', reason: 'Spam' });
      assert.deepEqual(await api.delete(db, 'alex', other.id, NOON), {
        ok: false,
        error: 'log_removed',
      });

      assert.ok((await api.delete(db, 'sam', saved.id, NOON)).ok);
      assert.equal(await api.findOwn(db, 'sam', saved.id), null);
    });
  });

  describe('anti-gaming', () => {
    it('holds eligible logs from new accounts when more than five arrive in a week', async () => {
      const db = await testDb();
      const yesterday = new Date(NOON.getTime() - DAY);
      const veteran = await createMember('veteran');
      await log(veteran, venue, yesterday);
      await log(veteran, venue, NOON);
      // Three new accounts, two days each: six eligible logs from new accounts.
      for (const id of ['new-1', 'new-2', 'new-3']) {
        await createMember(id, new Date(yesterday.getTime() - 3 * DAY));
        await log(id, venue, yesterday);
        await log(id, venue, NOON);
      }
      const rows = await statuses(venue);
      for (const row of rows) {
        if (row.member === 'veteran') assert.equal(row.status, 'visible');
        else assert.deepEqual([row.status, row.reason], ['held', 'new_accounts'], row.member);
      }
      const queue = await api.listHeld(db);
      assert.equal(queue.length, 6);
      assert.equal(
        Object.keys(queue[0]).some((key) => /email/i.test(key)),
        false
      );
    });

    it('leaves five new-account logs alone', async () => {
      const yesterday = new Date(NOON.getTime() - DAY);
      for (const id of ['new-1', 'new-2']) {
        await createMember(id, new Date(yesterday.getTime() - DAY));
        await log(id, venue, yesterday);
        await log(id, venue, NOON);
      }
      await createMember('new-3', new Date(yesterday.getTime() - DAY));
      await log('new-3', venue, NOON);
      // Four eligible, one provisional.
      assert.ok((await statuses(venue)).every((row) => row.status === 'visible'));
    });

    it('holds a week whose verdicts swing more than 1.5 points against the 90 days before', async () => {
      const db = await testDb();
      const monthAgo = new Date(NOON.getTime() - 30 * DAY);
      const members = ['a', 'b', 'c'];
      for (const id of members) {
        await createMember(id);
        await log(id, venue, monthAgo, { verdictVote: 'reject' });
        await log(id, venue, new Date(monthAgo.getTime() + DAY), { verdictVote: 'reject' });
      }
      await log('a', venue, new Date(NOON.getTime() - 2 * DAY), { verdictVote: 'approve' });
      await log('b', venue, new Date(NOON.getTime() - DAY), { verdictVote: 'approve' });
      assert.ok(
        (await statuses(venue)).every((row) => row.status === 'visible'),
        'two is not enough'
      );
      const third = await log('c', venue, NOON, { verdictVote: 'approve' });
      assert.equal(third.status, 'held');

      const held = (await statuses(venue)).filter((row) => row.status === 'held');
      assert.equal(held.length, 3);
      assert.ok(held.every((row) => row.reason === 'score_spike'));

      // A Chair approves one; a later save doesn't hold it again.
      const [first] = await api.listHeld(db);
      assert.ok((await api.approve(db, { id: first.id, actorId: 'chair' })).ok);
      assert.deepEqual(await api.approve(db, { id: first.id, actorId: 'chair' }), {
        ok: false,
        error: 'not_held',
      });
      await api.update(db, 'c', third.id, { ...input(venue), verdictVote: 'approve' }, NOON);
      const after = await db
        .select({ status: memberInspections.status, reviewedBy: memberInspections.reviewedBy })
        .from(memberInspections)
        .where(eq(memberInspections.id, first.id));
      assert.deepEqual(after, [{ status: 'visible', reviewedBy: 'chair' }]);
    });
  });

  describe('the Chairs’ review', () => {
    it('removes with a reason, and records a stuffing attempt as a bribery record', async () => {
      const db = await testDb();
      const other = await createVenue('Pie Shop', { tier: 'approved' });
      for (const id of ['a', 'b', 'c']) await createMember(id);
      const a = await log('a', venue, NOON);
      const b = await log('b', venue, NOON);
      const elsewhere = await log('c', other, NOON);

      assert.deepEqual(await api.remove(db, { id: a.id, actorId: 'chair', reason: '  ' }), {
        ok: false,
        error: 'removal_reason_required',
      });

      assert.deepEqual(
        await api.recordStuffing(db, {
          venueId: venue,
          inspectionIds: [a.id, elsewhere.id],
          title: 'Stuffing',
          description: 'Ten accounts in an afternoon.',
          published: false,
          actorId: 'chair',
        }),
        { ok: false, error: 'stuffing_logs_mismatch' }
      );

      const recorded = await api.recordStuffing(db, {
        venueId: venue,
        inspectionIds: [a.id, b.id],
        title: 'Ledger stuffing at Chip Shop',
        description: 'Two accounts from the same kitchen.',
        published: true,
        actorId: 'chair',
      });
      assert.ok(recorded.ok);
      assert.equal(recorded.value.removed, 2);
      assert.deepEqual(recorded.published, {
        action: 'Create bribery record',
        venueId: null,
        when: 'queue',
      });
      const [record] = await db
        .select()
        .from(briberyRecords)
        .where(eq(briberyRecords.id, recorded.value.briberyRecordId));
      assert.equal(record.venueId, venue);
      assert.equal(record.venueNameText, 'Chip Shop');
      assert.equal(record.createdBy, 'chair');
      const linked = await db
        .select({ status: memberInspections.status, link: memberInspections.briberyRecordId })
        .from(memberInspections)
        .where(eq(memberInspections.venueId, venue));
      assert.deepEqual(
        linked.map((row) => [row.status, row.link]),
        [
          ['removed', record.id],
          ['removed', record.id],
        ]
      );
    });
  });

  describe('the public feed', () => {
    it('shows the last five visible logs, names only when opted in, and a weighted score', async () => {
      const db = await testDb();
      await createMember('shy');
      await createMember('proud');
      await db.insert(memberProfiles).values([
        {
          userId: 'shy',
          displayName: 'Shy Diner',
          displayNameKey: 'shy diner',
          showPublicly: false,
        },
        {
          userId: 'proud',
          displayName: 'Proud Diner',
          displayNameKey: 'proud diner',
          showPublicly: true,
        },
      ]);
      await log('shy', venue, NOON, { pullQuote: 'Good pie' });
      await log('proud', venue, new Date(NOON.getTime() - DAY), { verdictVote: 'reject' });
      await log('proud', venue, NOON, { verdictVote: 'approve' });
      const removed = await log('proud', venue, new Date(NOON.getTime() - 2 * DAY));
      await api.remove(db, { id: removed.id, actorId: 'chair', reason: 'Duplicate' });

      const feed = await api.recentPublic(db, 'chip-shop');
      assert.ok(feed);
      assert.equal(feed.recent.length, 3);
      assert.deepEqual(
        feed.recent.map((entry) => entry.visitDate),
        ['2026-11-11', '2026-11-11', '2026-11-10']
      );
      const names = feed.recent.map((entry) => entry.displayName);
      assert.ok(!names.includes('Shy Diner'));
      assert.equal(names.filter((name) => name === 'Proud Diner').length, 2);
      const shy = feed.recent.find((entry) => entry.pullQuote === 'Good pie')!;
      assert.equal(shy.displayName, null);
      assert.equal(shy.provisional, true);

      // Only Proud Diner's two logs are eligible: one member, so the plain mean.
      assert.equal(feed.eligibleLogs, 2);
      assert.equal(feed.score, 3);

      // Nothing that identifies or locates the member.
      assert.deepEqual(Object.keys(feed.recent[0]).sort(), [
        'cost',
        'dish',
        'displayName',
        'provisional',
        'pullQuote',
        'verdictVote',
        'verifiedOnSite',
        'visitDate',
      ]);

      // A Chair hiding the name hides it here too.
      await db
        .update(memberProfiles)
        .set({ hiddenByChairAt: new Date() })
        .where(eq(memberProfiles.userId, 'proud'));
      const hidden = await api.recentPublic(db, 'chip-shop');
      assert.ok(hidden!.recent.every((entry) => entry.displayName === null));

      assert.equal(await api.recentPublic(db, 'nowhere'), null);
    });
  });

  describe('the member’s account', () => {
    it('exports their logs and deletes them with the account', async () => {
      const db = await testDb();
      await createMember('sam');
      await log('sam', venue, NOON);
      const data = await memberAccounts.exportData(db, 'sam');
      assert.equal(data?.lunchLogs.length, 1);
      assert.equal(data?.lunchLogs[0].venue, 'Chip Shop');
      assert.equal('reviewReason' in data!.lunchLogs[0], false);

      assert.ok((await memberAccounts.delete(db, 'sam')).ok);
      assert.equal((await statuses(venue)).length, 0);
    });
  });
});
