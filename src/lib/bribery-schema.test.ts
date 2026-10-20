import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { briberyInputSchema, briberyPublishSchema } from './bribery-schema';

const valid = { title: 'Free cookie', description: 'A cookie was offered at the till.' };

describe('briberyInputSchema', () => {
  it('accepts a minimal record with defaults', () => {
    const result = briberyInputSchema.parse(valid);
    assert.equal(result.published, true);
    assert.deepEqual(result.peopleInvolved, []);
    assert.deepEqual(result.witnesses, []);
    assert.equal(result.venueId, null);
    assert.equal(result.incidentDate, null);
  });

  it('splits people and witnesses on commas and newlines', () => {
    const result = briberyInputSchema.parse({ ...valid, peopleInvolved: 'Ann, Bob\nCy,, ', witnesses: [' Dee ', ''] });
    assert.deepEqual(result.peopleInvolved, ['Ann', 'Bob', 'Cy']);
    assert.deepEqual(result.witnesses, ['Dee']);
  });

  it('limits list size and name length', () => {
    const many = Array.from({ length: 31 }, (_, i) => `p${i}`);
    assert.equal(briberyInputSchema.safeParse({ ...valid, witnesses: many }).success, false);
    assert.equal(briberyInputSchema.safeParse({ ...valid, peopleInvolved: ['x'.repeat(121)] }).success, false);
  });

  it('requires a title and a meaningful description', () => {
    assert.equal(briberyInputSchema.safeParse({ ...valid, title: 'a' }).success, false);
    assert.equal(briberyInputSchema.safeParse({ ...valid, description: 'too short' }).success, false);
  });

  it('validates venue id, date and 24-hour time', () => {
    assert.equal(briberyInputSchema.safeParse({ ...valid, venueId: 'not-a-uuid' }).success, false);
    assert.equal(
      briberyInputSchema.safeParse({ ...valid, venueId: '3f2b7a52-5c1e-4c0d-9a4f-1a2b3c4d5e6f' }).success,
      true
    );
    assert.equal(briberyInputSchema.safeParse({ ...valid, incidentDate: '2026-02-30' }).success, false);
    assert.equal(briberyInputSchema.safeParse({ ...valid, incidentTime: '12:30' }).success, true);
    assert.equal(briberyInputSchema.safeParse({ ...valid, incidentTime: '24:00' }).success, false);
    assert.equal(briberyInputSchema.safeParse({ ...valid, incidentTime: '9:30' }).success, false);
    assert.equal(briberyInputSchema.parse({ ...valid, incidentTime: '' }).incidentTime, null);
  });

  it('enforces optional text limits', () => {
    assert.equal(briberyInputSchema.safeParse({ ...valid, value: 'x'.repeat(61) }).success, false);
    assert.equal(briberyInputSchema.safeParse({ ...valid, benefitOffered: 'x'.repeat(501) }).success, false);
  });
});

describe('briberyPublishSchema', () => {
  it('requires a boolean', () => {
    assert.equal(briberyPublishSchema.safeParse({ published: false }).success, true);
    assert.equal(briberyPublishSchema.safeParse({ published: 'yes' }).success, false);
    assert.equal(briberyPublishSchema.safeParse({}).success, false);
  });
});
