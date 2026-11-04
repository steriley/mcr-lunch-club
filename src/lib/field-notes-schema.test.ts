import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarDay, noteBodySchema, visitDateSchema } from '@/lib/field-notes-schema';
import { daysAfterVisit } from '@/lib/field-notes';
import { visitStatusLabel } from '@/lib/inspection-display';

describe('field note body', () => {
  it('trims, keeps inner newlines and allows 1 to 4,000 characters', () => {
    assert.equal(
      noteBodySchema.parse('  Cold chips.\n\nWarm welcome.  '),
      'Cold chips.\n\nWarm welcome.'
    );
    assert.equal(noteBodySchema.parse('x'.repeat(4000)).length, 4000);
    assert.equal(noteBodySchema.safeParse('x'.repeat(4001)).success, false);
    assert.equal(noteBodySchema.safeParse(' \n\t ').success, false);
    assert.equal(noteBodySchema.safeParse(42).success, false);
  });
});

describe('visit date', () => {
  // 00:30 on 3 Nov 2026 in London (GMT), still 2 Nov in New York.
  const now = () => new Date('2026-11-03T00:30:00Z');
  const schema = visitDateSchema(now);

  it('accepts today and earlier days on the London clock', () => {
    assert.equal(schema.parse('2026-11-03'), '2026-11-03');
    assert.equal(schema.parse('2025-01-31'), '2025-01-31');
  });

  it('rejects the future', () => {
    const result = schema.safeParse('2026-11-04');
    assert.equal(result.success, false);
    assert.equal(result.error!.issues[0].message, 'A visit cannot be in the future.');
  });

  it('rejects anything that is not a real calendar day', () => {
    for (const value of ['2026-02-29', '2026-13-01', '3 Nov 2026', '', '2026-11-3']) {
      assert.equal(schema.safeParse(value).success, false, value);
    }
    assert.equal(isCalendarDay('2028-02-29'), true);
  });
});

describe('visit display helpers', () => {
  it('labels a visit by its inspection', () => {
    assert.equal(visitStatusLabel(null), 'Visit only');
    assert.equal(visitStatusLabel({ status: 'pending', outcome: 'satisfactory' }), 'Pending');
    assert.equal(visitStatusLabel({ status: 'lapsed', outcome: 'satisfactory' }), 'Unconfirmed');
    assert.equal(
      visitStatusLabel({ status: 'confirmed', outcome: 'below_par' }),
      'Confirmed: below par'
    );
  });

  it('counts London days between the visit and the note', () => {
    assert.equal(daysAfterVisit('2026-11-03', new Date('2026-11-03T23:30:00Z')), 0);
    // 00:30 BST on 22 Oct is still 21 Oct in UTC.
    assert.equal(daysAfterVisit('2026-10-21', new Date('2026-10-21T23:30:00Z')), 1);
    assert.equal(daysAfterVisit('2026-10-01', new Date('2026-11-03T12:00:00Z')), 33);
    assert.equal(daysAfterVisit('2026-11-05', new Date('2026-11-03T12:00:00Z')), 0);
  });
});
