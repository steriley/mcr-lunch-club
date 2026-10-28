import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestionInputSchema, suggestionStatusSchema } from './suggestion-schema';

const valid = {
  name: 'Pasty Palace',
  address: '14 Peter Street',
  rationale: 'Fast, cheap and excellent.',
};

describe('suggestionInputSchema', () => {
  it('accepts the minimum fields and nulls blank optional ones', () => {
    const parsed = suggestionInputSchema.parse({
      ...valid,
      cuisine: '  ',
      cost: '',
      submitterName: '',
    });
    assert.equal(parsed.cuisine, null);
    assert.equal(parsed.cost, null);
    assert.equal(parsed.submitterName, null);
  });

  it('trims text', () => {
    assert.equal(
      suggestionInputSchema.parse({ ...valid, name: '  Pasty Palace  ' }).name,
      'Pasty Palace'
    );
  });

  it('requires a name, an address and a reason', () => {
    const result = suggestionInputSchema.safeParse({ name: 'x', address: '', rationale: 'short' });
    assert.equal(result.success, false);
    const fields = new Set(result.error!.issues.map((issue) => issue.path[0]));
    assert.deepEqual(fields, new Set(['name', 'address', 'rationale']));
  });

  it('only accepts the club cost bands', () => {
    assert.equal(suggestionInputSchema.safeParse({ ...valid, cost: '££' }).success, true);
    assert.equal(suggestionInputSchema.safeParse({ ...valid, cost: '$$' }).success, false);
  });

  it('caps field lengths', () => {
    assert.equal(
      suggestionInputSchema.safeParse({ ...valid, rationale: 'x'.repeat(2001) }).success,
      false
    );
    assert.equal(
      suggestionInputSchema.safeParse({ ...valid, name: 'x'.repeat(201) }).success,
      false
    );
  });

  it('passes the honeypot through for the route to check', () => {
    assert.equal(suggestionInputSchema.parse({ ...valid, website: 'spam' }).website, 'spam');
  });
});

describe('suggestionStatusSchema', () => {
  it('allows dismissing and restoring, but not accepting directly', () => {
    assert.equal(suggestionStatusSchema.safeParse({ status: 'dismissed' }).success, true);
    assert.equal(suggestionStatusSchema.safeParse({ status: 'new' }).success, true);
    assert.equal(suggestionStatusSchema.safeParse({ status: 'accepted' }).success, false);
  });
});
