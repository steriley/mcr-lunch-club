import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actorName, describeVenueEvent } from './venue-events';

describe('describeVenueEvent', () => {
  const createdAt = new Date('2026-10-21T22:30:00Z'); // 23:30 in London (BST)

  it('reads like "Closed by Sam on 21st Oct 26"', () => {
    assert.equal(
      describeVenueEvent({ kind: 'closed', actorName: 'Sam', createdAt }),
      'Closed by Sam on 21st Oct 26'
    );
    assert.equal(
      describeVenueEvent({ kind: 'reopened', actorName: 'Alex', createdAt }),
      'Reopened by Alex on 21st Oct 26'
    );
  });

  it('describes photo events as text lines', () => {
    const at = new Date('2026-10-22T11:00:00Z');
    assert.equal(
      describeVenueEvent({ kind: 'image_added', actorName: 'Sam', createdAt: at }),
      'Photo added by Sam on 22nd Oct 26'
    );
    assert.equal(
      describeVenueEvent({ kind: 'image_removed', actorName: 'Alex', createdAt: at }),
      'Photo removed by Alex on 22nd Oct 26'
    );
    assert.equal(
      describeVenueEvent({ kind: 'image_primary_changed', actorName: 'Jo', createdAt: at }),
      'Primary photo changed by Jo on 22nd Oct 26'
    );
  });

  it('uses the London date', () => {
    assert.equal(
      describeVenueEvent({
        kind: 'closed',
        actorName: 'Sam',
        createdAt: new Date('2026-10-21T23:30:00Z'),
      }),
      'Closed by Sam on 22nd Oct 26'
    );
  });

  it('copes with a missing name snapshot', () => {
    assert.equal(
      describeVenueEvent({ kind: 'closed', actorName: null, createdAt }),
      'Closed by a former admin on 21st Oct 26'
    );
  });
});

describe('actorName', () => {
  it('prefers the display name, then the email', () => {
    assert.equal(actorName({ id: '1', name: 'Sam', email: 'sam@example.com' }), 'Sam');
    assert.equal(actorName({ id: '1', name: '  ', email: 'sam@example.com' }), 'sam@example.com');
    assert.equal(actorName({ id: '1', name: null }), 'Unknown admin');
  });
});
