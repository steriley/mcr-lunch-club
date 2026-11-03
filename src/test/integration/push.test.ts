import '../setup-env';
import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { user } from '@/db/auth-schema';
import { pushSubscriptions, venueSuggestions } from '@/db/schema';
import type { PushSender, SendResult } from '@/lib/push/delivery';
import { proposalEvent } from '@/lib/push/messages';
import { deliverPushEvent, sendTestPush } from '@/lib/push/notify';
import {
  badgeFor,
  claimTestSlot,
  deleteSubscription,
  deleteUserSubscriptions,
  getPreferences,
  savePreferences,
  upsertSubscription,
} from '@/lib/push/store';
import { proposeTier } from '@/lib/tier-proposals';
import {
  closeTestDb,
  createAdmin,
  createVenue,
  resetTestDb,
  skipIntegration,
  testDb,
  type TestAdmin,
} from './db';

const device = (name: string) => ({
  endpoint: `https://push.example/${name}`,
  keys: { p256dh: `p256dh${name}`, auth: `auth${name}` },
  label: `${name} · Chrome`,
});

/** Answers each endpoint from `answers` (default 201) and records every send. */
function fakeSender(answers: Record<string, SendResult[]> = {}) {
  const sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
  const sender: PushSender = async (target, payload) => {
    sent.push({ endpoint: target.endpoint, payload: JSON.parse(payload) });
    const queue = answers[target.endpoint];
    return queue?.length ? queue.shift()! : { statusCode: 201 };
  };
  return { sender, sent };
}

const noSleep = async () => undefined;

describe('push notifications (database)', { skip: skipIntegration }, () => {
  let sam: TestAdmin;
  let alex: TestAdmin;
  let jo: TestAdmin;
  let venueId: string;

  beforeEach(async () => {
    await resetTestDb();
    sam = await createAdmin('sam', 'Sam');
    alex = await createAdmin('alex', 'Alex');
    jo = await createAdmin('jo', 'Jo');
    venueId = await createVenue('Chip Shop', { tier: 'under_consideration' });
  });

  after(closeTestDb);

  const subscriptionsOf = async (userId: string) =>
    (await testDb()).select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  it('upserting by endpoint moves a device to whoever subscribed last', async () => {
    const db = await testDb();
    await upsertSubscription(db, sam.id, device('shared'));
    await upsertSubscription(db, alex.id, device('shared'));
    assert.equal((await subscriptionsOf(sam.id)).length, 0);
    assert.equal((await subscriptionsOf(alex.id)).length, 1);
  });

  it('replacing an endpoint keeps its label, and only the owner can remove it', async () => {
    const db = await testDb();
    await upsertSubscription(db, sam.id, device('old'));
    await upsertSubscription(db, sam.id, {
      ...device('new'),
      label: undefined,
      oldEndpoint: device('old').endpoint,
    });
    const [only] = await subscriptionsOf(sam.id);
    assert.equal(only.endpoint, device('new').endpoint);
    assert.equal(only.userAgentLabel, 'old · Chrome');

    assert.equal(await deleteSubscription(db, alex.id, { endpoint: only.endpoint }), false);
    assert.equal(await deleteSubscription(db, sam.id, { id: only.id }), true);
  });

  it('deactivating removes a Chair’s devices, and deleting the user cascades', async () => {
    const db = await testDb();
    await upsertSubscription(db, sam.id, device('a'));
    await upsertSubscription(db, sam.id, device('b'));
    await upsertSubscription(db, alex.id, device('c'));
    assert.equal(await deleteUserSubscriptions(db, sam.id), 2);
    await savePreferences(db, alex.id, { suggestions: true });
    await db.delete(user).where(eq(user.id, alex.id));
    assert.equal((await db.select().from(pushSubscriptions)).length, 0);
  });

  it('sends a proposal to the other active Chairs’ devices, not the proposer’s', async () => {
    const db = await testDb();
    const banned = await createAdmin('banned', 'Banned', { banned: true });
    for (const [chair, name] of [
      [sam, 'sam'],
      [alex, 'alex-phone'],
      [alex, 'alex-laptop'],
      [jo, 'jo'],
      [banned, 'banned'],
    ] as const)
      await upsertSubscription(db, chair.id, device(name));
    await savePreferences(db, jo.id, { proposals: false });

    const result = await proposeTier(db, venueId, 'if_we_must', sam);
    assert.ok(result.ok);
    const { sender, sent } = fakeSender();
    const report = await deliverPushEvent(db, proposalEvent(result.value), { sender });

    assert.deepEqual(report, { sent: 2, failed: 0, removed: 0 });
    assert.deepEqual(sent.map((push) => push.endpoint).sort(), [
      device('alex-laptop').endpoint,
      device('alex-phone').endpoint,
    ]);
    assert.equal(sent[0].payload.title, 'Verdict awaiting countersign');
    assert.equal(sent[0].payload.body, 'Sam proposes Chip Shop: Under Consideration → If We Must');
    // The pending proposal is Sam's, so it counts for Alex.
    assert.equal(sent[0].payload.badge, 1);
    const [delivered] = await subscriptionsOf(alex.id);
    assert.ok(delivered.lastSuccessAt);
  });

  it('deletes gone subscriptions, retries a 429 once and counts failures', async () => {
    const db = await testDb();
    await upsertSubscription(db, alex.id, device('gone'));
    await upsertSubscription(db, alex.id, device('busy'));
    await upsertSubscription(db, jo.id, device('broken'));
    const result = await proposeTier(db, venueId, 'if_we_must', sam);
    assert.ok(result.ok);
    const { sender, sent } = fakeSender({
      [device('gone').endpoint]: [{ statusCode: 410 }],
      [device('busy').endpoint]: [{ statusCode: 429 }, { statusCode: 201 }],
      [device('broken').endpoint]: [{ statusCode: 400 }],
    });
    const warn = console.warn;
    console.warn = () => {};
    const report = await deliverPushEvent(db, proposalEvent(result.value), {
      sender,
      sleep: noSleep,
    }).finally(() => (console.warn = warn));

    assert.deepEqual(report, { sent: 1, failed: 1, removed: 1 });
    assert.equal(sent.filter((push) => push.endpoint === device('busy').endpoint).length, 2);
    assert.deepEqual(
      (await subscriptionsOf(alex.id)).map((row) => row.endpoint),
      [device('busy').endpoint]
    );
    assert.equal((await subscriptionsOf(jo.id))[0].failureCount, 1);
  });

  it('throttles suggestion pushes to one per Chair per ten minutes, with a running count', async () => {
    const db = await testDb();
    await upsertSubscription(db, jo.id, device('jo'));
    await upsertSubscription(db, alex.id, device('alex'));
    await savePreferences(db, jo.id, { suggestions: true });
    const suggest = () =>
      db.insert(venueSuggestions).values({ name: 'Pie Shop', address: '1 Street', rationale: 'x' });

    const start = new Date();
    await suggest();
    const first = fakeSender();
    await deliverPushEvent(db, { type: 'suggestion' }, { sender: first.sender, now: start });
    assert.deepEqual(
      first.sent.map((push) => [push.endpoint, push.payload.title]),
      [[device('jo').endpoint, 'New venue suggestion']]
    );

    await suggest();
    const soon = fakeSender();
    await deliverPushEvent(
      db,
      { type: 'suggestion' },
      { sender: soon.sender, now: new Date(start.getTime() + 5 * 60_000) }
    );
    assert.equal(soon.sent.length, 0);

    await suggest();
    const later = fakeSender();
    await deliverPushEvent(
      db,
      { type: 'suggestion' },
      { sender: later.sender, now: new Date(start.getTime() + 11 * 60_000) }
    );
    assert.equal(later.sent[0].payload.title, '3 new venue suggestions');
    assert.equal(later.sent[0].payload.body, 'Waiting in the Chairs’ inbox.');
  });

  it('counts the badge without the Chair’s own items', async () => {
    const db = await testDb();
    await proposeTier(db, venueId, 'if_we_must', sam);
    assert.equal(await badgeFor(db, sam.id), 0);
    assert.equal(await badgeFor(db, alex.id), 1);
  });

  it('sends test pushes to the caller’s own devices only, a few a minute', async () => {
    const db = await testDb();
    await upsertSubscription(db, sam.id, device('sam'));
    await upsertSubscription(db, alex.id, device('alex'));
    const { sender, sent } = fakeSender();
    assert.deepEqual(await sendTestPush(db, sam.id, { sender }), {
      sent: 1,
      failed: 0,
      removed: 0,
    });
    assert.deepEqual(
      sent.map((push) => push.endpoint),
      [device('sam').endpoint]
    );

    const now = new Date();
    assert.equal(await claimTestSlot(db, sam.id, now), true);
    assert.equal(await claimTestSlot(db, sam.id, new Date(now.getTime() + 5000)), false);
    assert.equal(await claimTestSlot(db, sam.id, new Date(now.getTime() + 20_000)), true);
  });

  it('keeps preferences per Chair, with suggestions off by default', async () => {
    const db = await testDb();
    assert.deepEqual(await getPreferences(db, sam.id), {
      proposals: true,
      decisions: true,
      visits: true,
      suggestions: false,
      promptDismissed: false,
    });
    await savePreferences(db, sam.id, { visits: false, promptDismissed: true });
    const saved = await getPreferences(db, sam.id);
    assert.equal(saved.visits, false);
    assert.equal(saved.proposals, true);
    assert.equal(saved.promptDismissed, true);
  });
});
