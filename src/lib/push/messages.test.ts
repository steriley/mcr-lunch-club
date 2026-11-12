import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { InspectionRow, TierProposalRow } from '@/db/schema';
import {
  badgeCount,
  buildMessage,
  decisionEvent,
  DEFAULT_PREFERENCES,
  deliveryOptions,
  encodeMessage,
  MAX_PAYLOAD_BYTES,
  proposalEvent,
  selectRecipients,
  testMessage,
  visitEvent,
  type ChairCandidate,
  type PushEvent,
} from './messages';

const chair = (id: string, overrides: Partial<ChairCandidate> = {}): ChairCandidate => ({
  id,
  role: 'admin',
  banned: false,
  banExpires: null,
  preferences: { ...DEFAULT_PREFERENCES },
  ...overrides,
});

const VENUE = '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f';
const proposal: PushEvent = {
  type: 'proposal',
  venueId: VENUE,
  proposerId: 'sam',
  proposerName: 'Sam',
  fromTier: 'under_consideration',
  toTier: 'approved',
};

describe('selectRecipients', () => {
  const chairs = [
    chair('sam'),
    chair('alex'),
    chair('jo'),
    chair('banned', { banned: true }),
    chair('expired-ban', { banned: true, banExpires: new Date('2020-01-01') }),
    chair('member', { role: 'user' }),
    chair('muted', { preferences: { ...DEFAULT_PREFERENCES, proposals: false, visits: false } }),
  ];

  it('sends a proposal to every other active Chair who wants proposals', () => {
    assert.deepEqual(selectRecipients(proposal, chairs), ['alex', 'jo', 'expired-ban']);
  });

  it('never notifies the Chair who caused the event', () => {
    for (const event of [
      proposal,
      {
        type: 'visit_waiting',
        venueId: VENUE,
        date: '2026-11-03',
        firstChairId: 'sam',
        firstChairName: 'Sam',
      } as PushEvent,
    ]) {
      assert.ok(!selectRecipients(event, chairs).includes('sam'));
    }
  });

  it('sends a decision to the proposer only, and only while they are an active Chair', () => {
    const decision: PushEvent = {
      type: 'decision',
      proposalId: 'p1',
      venueId: VENUE,
      proposerId: 'sam',
      deciderName: 'Alex',
      approved: true,
    };
    assert.deepEqual(selectRecipients(decision, chairs), ['sam']);
    assert.deepEqual(selectRecipients({ ...decision, proposerId: 'banned' }, chairs), []);
    assert.deepEqual(selectRecipients({ ...decision, proposerId: null }, chairs), []);
    const optedOut = chairs.map((c) =>
      c.id === 'sam' ? { ...c, preferences: { ...c.preferences, decisions: false } } : c
    );
    assert.deepEqual(selectRecipients(decision, optedOut), []);
  });

  it('sends a countersign to the first presser only', () => {
    const confirmed: PushEvent = {
      type: 'visit_confirmed',
      venueId: VENUE,
      date: '2026-11-03',
      firstChairId: 'sam',
      secondChairId: 'alex',
      secondChairName: 'Alex',
    };
    assert.deepEqual(selectRecipients(confirmed, chairs), ['sam']);
    assert.deepEqual(selectRecipients({ ...confirmed, firstChairId: 'alex' }, chairs), []);
  });

  it('sends suggestions only to Chairs who switched them on (off by default)', () => {
    assert.deepEqual(selectRecipients({ type: 'suggestion' }, chairs), []);
    const keen = chairs.map((c) =>
      c.id === 'jo' ? { ...c, preferences: { ...c.preferences, suggestions: true } } : c
    );
    assert.deepEqual(selectRecipients({ type: 'suggestion' }, keen), ['jo']);
  });

  it('sends contact messages only to Chairs who switched them on (off by default, #132)', () => {
    assert.equal(DEFAULT_PREFERENCES.contact, false);
    assert.deepEqual(selectRecipients({ type: 'contact' }, chairs), []);
    const keen = chairs.map((c) =>
      c.id === 'alex' ? { ...c, preferences: { ...c.preferences, contact: true } } : c
    );
    assert.deepEqual(selectRecipients({ type: 'contact' }, keen), ['alex']);
  });

  it('tells only the owner when a passkey is added, whatever their preferences (#153)', () => {
    const event: PushEvent = { type: 'passkey_added', userId: 'muted' };
    assert.deepEqual(selectRecipients(event, chairs), ['muted']);
    const allOff = chair('quiet', {
      preferences: {
        proposals: false,
        decisions: false,
        visits: false,
        suggestions: false,
        contact: false,
      },
    });
    assert.deepEqual(selectRecipients({ type: 'passkey_added', userId: 'quiet' }, [allOff]), [
      'quiet',
    ]);
    assert.deepEqual(selectRecipients({ type: 'passkey_added', userId: 'banned' }, chairs), []);
    assert.deepEqual(selectRecipients({ type: 'passkey_added', userId: 'member' }, chairs), []);
  });

  it('has nobody to tell when there is only one active Chair', () => {
    assert.deepEqual(selectRecipients(proposal, [chair('sam'), chair('x', { banned: true })]), []);
  });
});

describe('badgeCount', () => {
  const work = {
    proposalProposers: ['sam', 'alex', null],
    visitPressers: ['sam', 'jo'],
    newSuggestions: 4,
    newContactMessages: 2,
  };

  it("excludes the Chair's own proposals and visit presses", () => {
    assert.equal(badgeCount('sam', work, DEFAULT_PREFERENCES), 3);
    assert.equal(badgeCount('jo', work, DEFAULT_PREFERENCES), 4);
  });

  it('adds new suggestions for Chairs who follow them', () => {
    assert.equal(badgeCount('sam', work, { ...DEFAULT_PREFERENCES, suggestions: true }), 7);
  });

  it('adds unread contact messages for Chairs who follow them (#132)', () => {
    assert.equal(badgeCount('sam', work, { ...DEFAULT_PREFERENCES, contact: true }), 5);
  });
});

describe('buildMessage', () => {
  it('writes the proposal copy, tagged per venue so a replacement replaces it', () => {
    const message = buildMessage(proposal, { venueName: 'Chip Shop', badge: 2 });
    assert.equal(message.title, 'Verdict awaiting countersign');
    assert.equal(message.body, 'Sam proposes Chip Shop: Under Consideration → Approved');
    assert.equal(message.tag, `proposal:${VENUE}`);
    assert.equal(message.url, `/admin/venues/${VENUE}#tier-decree`);
    assert.equal(message.badge, 2);
  });

  it('writes the new-venue copy when there is no approved verdict yet', () => {
    const message = buildMessage(
      { ...proposal, fromTier: null, toTier: 'to_be_assessed' },
      { venueName: 'Chip Shop', badge: 0 }
    );
    assert.equal(message.title, 'New venue awaiting countersign');
    assert.equal(message.body, 'Sam has entered Chip Shop as To Be Assessed');
  });

  it('says approved or declined, never why', () => {
    const declined = buildMessage(
      {
        type: 'decision',
        proposalId: 'p1',
        venueId: VENUE,
        proposerId: 'sam',
        deciderName: 'Alex',
        approved: false,
      },
      { venueName: 'Chip Shop', badge: 0 }
    );
    assert.equal(declined.title, 'Your verdict was declined');
    assert.equal(declined.body, 'Chip Shop · Alex');
    assert.equal(declined.tag, 'decision:p1');
    assert.equal(declined.url, `/admin/venues/${VENUE}/history`);
  });

  it('asks for a countersign before midnight, and alerts again when it changes', () => {
    const waiting = buildMessage(
      {
        type: 'visit_waiting',
        venueId: VENUE,
        date: '2026-11-03',
        firstChairId: 'sam',
        firstChairName: 'Sam',
      },
      { venueName: 'Chip Shop', badge: 1 }
    );
    assert.equal(waiting.title, 'Inspection needs a second Chair');
    assert.equal(waiting.body, 'Sam visited Chip Shop today. Countersign before midnight.');
    assert.equal(waiting.tag, `visit:${VENUE}:2026-11-03`);
    assert.equal(waiting.renotify, true);
  });

  it('counts suggestions in one rolling notification', () => {
    assert.equal(
      buildMessage({ type: 'suggestion' }, { badge: 0, suggestionCount: 1 }).title,
      'New venue suggestion'
    );
    const many = buildMessage({ type: 'suggestion' }, { badge: 0, suggestionCount: 3 });
    assert.equal(many.title, '3 new venue suggestions');
    assert.equal(many.tag, 'suggestions');
    assert.equal(many.url, '/admin/suggestions');
  });

  it('never carries a decline reason, note or suggestion text, even from a full row', () => {
    const row = {
      id: 'p1',
      venueId: VENUE,
      fromTier: 'approved',
      proposedTier: 'rejected',
      proposedBy: 'sam',
      proposedByName: 'Sam',
      status: 'declined',
      decidedBy: 'alex',
      decidedByName: 'Alex',
      declineReason: 'SECRET-REASON the chips were soggy',
      inspectionId: null,
    } as unknown as TierProposalRow;
    for (const event of [proposalEvent(row), decisionEvent(row)]) {
      const payload = encodeMessage(buildMessage(event, { venueName: 'Chip Shop', badge: 0 }));
      assert.ok(!payload.includes('SECRET-REASON'), payload);
      assert.ok(!payload.includes('soggy'), payload);
    }
    const suggestion = encodeMessage(
      buildMessage({ type: 'suggestion' }, { badge: 0, suggestionCount: 2 })
    );
    assert.deepEqual(Object.keys(JSON.parse(suggestion)).sort(), [
      'badge',
      'body',
      'tag',
      'title',
      'url',
      'v',
    ]);
  });

  it('says a contact message arrived and nothing about it: no sender, topic or text (#132)', () => {
    const one = buildMessage({ type: 'contact' }, { badge: 1, contactCount: 1 });
    assert.equal(one.title, 'New message from the website');
    assert.equal(one.tag, 'contact');
    assert.equal(one.url, '/admin/contact');
    assert.equal(
      buildMessage({ type: 'contact' }, { badge: 0, contactCount: 4 }).title,
      '4 new messages from the website'
    );
    // The event carries nothing but its type, so the payload can't either.
    const payload = JSON.parse(encodeMessage(one));
    assert.deepEqual(Object.keys(payload).sort(), ['badge', 'body', 'tag', 'title', 'url', 'v']);
    assert.equal(deliveryOptions({ type: 'contact' }, 10).urgency, 'low');
  });

  it('says a passkey was added without naming the device, and links to Account', () => {
    const message = buildMessage({ type: 'passkey_added', userId: 'sam' }, { badge: 0 });
    assert.equal(message.title, 'A passkey was added to your account');
    assert.equal(message.url, '/admin/account#passkeys');
    assert.equal(message.renotify, true);
  });

  it('stays far under 4 KB with the longest names', () => {
    const long = 'Ŵ'.repeat(5000);
    const events: PushEvent[] = [
      { ...proposal, proposerName: long },
      { ...proposal, fromTier: null, proposerName: long },
      {
        type: 'decision',
        proposalId: VENUE,
        venueId: VENUE,
        proposerId: 'sam',
        deciderName: long,
        approved: true,
      },
      {
        type: 'visit_waiting',
        venueId: VENUE,
        date: '2026-11-03',
        firstChairId: 'sam',
        firstChairName: long,
      },
      {
        type: 'visit_confirmed',
        venueId: VENUE,
        date: '2026-11-03',
        firstChairId: 'sam',
        secondChairId: 'alex',
        secondChairName: long,
      },
      { type: 'suggestion' },
    ];
    for (const event of events) {
      const payload = encodeMessage(
        buildMessage(event, { venueName: long, badge: 999, suggestionCount: 50 })
      );
      assert.ok(new TextEncoder().encode(payload).length < MAX_PAYLOAD_BYTES);
      assert.ok(MAX_PAYLOAD_BYTES < 4096);
    }
    assert.ok(encodeMessage(testMessage(0)).length < MAX_PAYLOAD_BYTES);
  });
});

describe('visitEvent', () => {
  const row = {
    venueId: VENUE,
    inspectionDate: '2026-11-03',
    firstAdminId: 'sam',
    firstAdminName: 'Sam',
    secondAdminId: 'alex',
    secondAdminName: 'Alex',
  };

  it('is a waiting visit while pending and a countersign once confirmed', () => {
    assert.equal(visitEvent({ ...row, status: 'pending' } as InspectionRow).type, 'visit_waiting');
    assert.equal(
      visitEvent({ ...row, status: 'confirmed' } as InspectionRow).type,
      'visit_confirmed'
    );
  });
});

describe('deliveryOptions', () => {
  it('makes visits urgent and expire at London midnight', () => {
    const waiting: PushEvent = {
      type: 'visit_waiting',
      venueId: VENUE,
      date: '2026-11-03',
      firstChairId: 'sam',
      firstChairName: 'Sam',
    };
    assert.deepEqual(deliveryOptions(waiting, 1234), { urgency: 'high', ttl: 1234 });
  });

  it('keeps proposals normal and suggestions low', () => {
    assert.equal(deliveryOptions(proposal, 10).urgency, 'normal');
    assert.equal(deliveryOptions({ type: 'suggestion' }, 10).urgency, 'low');
  });
});
