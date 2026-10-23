import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DECREES } from './decrees';

describe('DECREES', () => {
  it('opens with the standing Decree #284', () => {
    assert.equal(DECREES[0].number, 284);
  });

  it('gives every decree its own number and some text', () => {
    assert.equal(new Set(DECREES.map((decree) => decree.number)).size, DECREES.length);
    assert.ok(DECREES.every((decree) => decree.text.trim().length > 0));
  });
});
