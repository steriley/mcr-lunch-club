import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { pendingPublishChanges, publishState } from '@/db/schema';
import {
  databaseNow,
  getPublishStatus,
  recordPendingChange,
  recordPublishRequest,
  settlePublish,
} from '@/lib/publishing';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  type TestAdmin,
} from './db';

describe('batch publishing (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let venueId: string;

  beforeEach(async () => {
    await resetTestDb();
    const db = await testDb();
    await db.execute(sql`truncate table ${publishState}, publish_requests`);
    sam = await createAdmin('sam', 'Sam');
    venueId = await createVenue('Chip Shop');
  });

  after(closeTestDb);

  // The status compares times as JS dates (milliseconds), so keep the steps apart.
  const pause = () => new Promise((resolve) => setTimeout(resolve, 5));

  const pendingActions = async () =>
    (await (await testDb()).select().from(pendingPublishChanges)).map((row) => row.action).sort();

  it('settle removes changes saved before the build started and keeps later ones', async () => {
    const db = await testDb();
    await recordPendingChange(db, { action: 'Before', venueId, actorId: sam.id });
    const cut = await databaseNow(db);
    await recordPendingChange(db, { action: 'After', venueId, actorId: sam.id });

    assert.equal(await settlePublish(db, cut), 1);
    assert.deepEqual(await pendingActions(), ['After']);
    const [state] = await db.select().from(publishState);
    assert.equal(state.lastPublishedAt?.toISOString(), new Date(cut).toISOString());
  });

  it('settle with nothing pending still stamps the publish time, and repeats safely', async () => {
    const db = await testDb();
    const cut = await databaseNow(db);
    assert.equal(await settlePublish(db, cut), 0);
    assert.equal(await settlePublish(db, cut), 0);
    assert.equal((await db.select().from(publishState)).length, 1);
  });

  it('still names a deleted venue from the snapshot taken when the change was recorded', async () => {
    const db = await testDb();
    await recordPendingChange(db, { action: 'Delete venue', venueId, actorId: sam.id });
    await db.execute(sql`delete from venues where id = ${venueId}`);
    const status = await getPublishStatus(db);
    const [change] = status.changes;
    assert.deepEqual(
      [status.count, change.venueId, change.venueName, change.actorName],
      [1, null, 'Chip Shop', 'Sam']
    );
  });

  it('names a renamed venue by its current name', async () => {
    const db = await testDb();
    await recordPendingChange(db, { action: 'Update venue', venueId, actorId: sam.id });
    await db.execute(sql`update venues set name = 'Chippy' where id = ${venueId}`);
    const [change] = (await getPublishStatus(db)).changes;
    assert.equal(change.venueName, 'Chippy');
  });

  it('reports publishing after an accepted request, then idle once the build settles', async () => {
    const db = await testDb();
    await recordPendingChange(db, { action: 'Update venue', venueId, actorId: sam.id });
    await pause();
    await recordPublishRequest(db, { source: 'chair', requestedBy: sam.id, accepted: true });
    await pause();
    await recordPendingChange(db, { action: 'Recompute venue route', venueId, actorId: sam.id });

    const during = await getPublishStatus(db);
    assert.deepEqual([during.state, during.publishing, during.newSince], ['publishing', 1, 1]);

    // A build that starts now covers both changes.
    await settlePublish(db, await databaseNow(db));
    assert.equal((await getPublishStatus(db)).state, 'idle');
  });

  it('refuses a request source outside the allowed set', async () => {
    const db = await testDb();
    await assert.rejects(
      recordPublishRequest(db, { source: 'robot' as never, requestedBy: null, accepted: true })
    );
  });
});
