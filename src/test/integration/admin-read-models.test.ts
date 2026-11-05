import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inspections, venueImages, venueSuggestions } from '@/db/schema';
import { loadDashboard, loadVenueDossier, loadVenueHistory } from '@/lib/admin-read-models';
import { proposeTier } from '@/lib/tier-proposals';
import { venueLifecycle } from '@/lib/venue-lifecycle';
import { recordVisit } from './visit-helpers';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  type TestAdmin,
} from './db';

describe('Chairs’ Area read models (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let jo: TestAdmin;

  beforeEach(async () => {
    await resetTestDb();
    const db = await testDb();
    await db.delete(venueSuggestions);
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    jo = await createAdmin('jo', 'Jo');
  });

  after(closeTestDb);

  describe('loadDashboard', () => {
    it('counts pending proposals, new suggestions and hidden venues', async () => {
      const db = await testDb();
      const visible = await createVenue('Chip Shop', { tier: 'approved' });
      await createVenue('Hidden Hut', { tier: null });
      await createVenue('No Location', { tier: 'approved', latitude: null, longitude: null });
      await proposeTier(db, visible, 'rejected', sam);
      await db.insert(venueSuggestions).values([
        { name: 'A', address: '1 A St', rationale: 'a' },
        { name: 'B', address: '2 B St', rationale: 'b' },
        { name: 'C', address: '3 C St', rationale: 'c', status: 'dismissed' },
      ]);

      const dashboard = await loadDashboard(db, alex.id);

      assert.equal(dashboard.awaitingCountersign, 1);
      assert.equal(dashboard.newSuggestions, 2);
      assert.deepEqual(dashboard.hidden.map((venue) => venue.name).sort(), [
        'Hidden Hut',
        'No Location',
      ]);
      assert.equal(dashboard.recent.length, 3);
      assert.deepEqual(
        dashboard.recent
          .filter((venue) => venue.hidden)
          .map((venue) => venue.name)
          .sort(),
        ['Hidden Hut', 'No Location']
      );
    });

    it('counts a pending inspection once, alongside pending proposals', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop', { tier: 'approved' });
      await recordVisit(db, id, sam, 'satisfactory');

      assert.equal((await loadDashboard(db, alex.id)).awaitingCountersign, 1);
      await proposeTier(db, id, 'rejected', sam);
      assert.equal((await loadDashboard(db, alex.id)).awaitingCountersign, 2);
    });

    it('is empty for an empty ledger', async () => {
      const dashboard = await loadDashboard(await testDb(), sam.id);
      assert.equal(dashboard.awaitingCountersign, 0);
      assert.equal(dashboard.newSuggestions, 0);
      assert.deepEqual(dashboard.recent, []);
      assert.deepEqual(dashboard.hidden, []);
    });
  });

  describe('loadVenueDossier', () => {
    it('assembles a venue with photos, a proposal, an inspection and a closed state', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop', { tier: 'approved', updatedBy: sam.id });
      await db.insert(venueImages).values({
        venueId: id,
        fullUrl: 'https://example.com/chips.webp',
        isPrimary: true,
      });
      await recordVisit(db, id, sam, 'satisfactory');
      await recordVisit(db, id, alex, 'satisfactory');
      await proposeTier(db, id, 'rejected', jo);
      await venueLifecycle.closeVenue(db, id, sam);

      const page = await loadVenueDossier(db, id, alex);

      assert.ok(page);
      assert.equal(page.venue.name, 'Chip Shop');
      assert.equal(page.updatedByName, 'Sam');
      assert.equal(page.images.length, 1);
      const { dossier } = page;
      assert.equal(dossier.currentUserId, 'alex');
      assert.equal(dossier.currentUserName, 'Alex');
      assert.equal(dossier.activeAdmins, 3);
      assert.equal(dossier.pendingMotion?.proposedByName, 'Jo');
      assert.match(dossier.latestVerifiedInspection ?? '', /verified by Sam and Alex/i);
      assert.equal(dossier.visits.length, 2);
      assert.equal(dossier.closed, true);
      assert.match(dossier.closedText ?? '', /Permanently closed: marked on .* by Sam\./);
      const kinds = new Set(dossier.timeline.map((entry) => entry.kind));
      for (const kind of ['motion', 'inspection', 'event'] as const) {
        assert.ok(kinds.has(kind), `timeline has a ${kind} entry`);
      }
    });

    it('is null for a venue that does not exist', async () => {
      const db = await testDb();
      assert.equal(await loadVenueDossier(db, '00000000-0000-4000-8000-000000000000', sam), null);
    });

    it('names a Chair whose name is gone "a former admin"', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop', { tier: 'approved' });
      await recordVisit(db, id, sam, 'satisfactory');
      await recordVisit(db, id, alex, 'satisfactory');
      // Names are snapshots on the inspection; a scrubbed account leaves them null.
      await db.update(inspections).set({ firstAdminName: null, secondAdminName: null });

      const page = await loadVenueDossier(db, id, jo);

      assert.ok(page);
      assert.match(
        page.dossier.latestVerifiedInspection ?? '',
        /verified by a former admin and a former admin/
      );
      const inspection = page.dossier.timeline.find((entry) => entry.kind === 'inspection');
      assert.match(inspection?.text ?? '', /Verified by a former admin and a former admin/);
    });
  });

  describe('loadVenueHistory', () => {
    it('returns the venue name and its timeline, newest first', async () => {
      const db = await testDb();
      const id = await createVenue('Chip Shop', { tier: 'approved' });
      await proposeTier(db, id, 'rejected', sam);
      await venueLifecycle.closeVenue(db, id, sam);

      const history = await loadVenueHistory(db, id);

      assert.ok(history);
      assert.equal(history.venue.name, 'Chip Shop');
      assert.ok(history.timeline.length >= 2);
      const times = history.timeline.map((entry) => entry.at.getTime());
      assert.deepEqual(
        times,
        [...times].sort((a, b) => b - a)
      );
    });

    it('is null for a venue that does not exist', async () => {
      assert.equal(
        await loadVenueHistory(await testDb(), '00000000-0000-4000-8000-000000000000'),
        null
      );
    });
  });
});
