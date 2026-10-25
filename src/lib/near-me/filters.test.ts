import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { COST_BANDS, matchesCost, toggleCost } from './filters';

describe('Near Me price filter', () => {
  it('lists the bands cheapest first', () => {
    assert.deepEqual(COST_BANDS, ['£', '££', '£££']);
  });

  it('matches any price when nothing is selected', () => {
    assert.equal(matchesCost({ cost: '£££' }, []), true);
    assert.equal(matchesCost({ cost: '£' }, ['££']), false);
    assert.equal(matchesCost({ cost: '££' }, ['£', '££']), true);
  });

  it('toggles a band on and off without mutating the selection', () => {
    const selected = ['£'] as const;
    assert.deepEqual(toggleCost(selected, '££'), ['£', '££']);
    assert.deepEqual(toggleCost(selected, '£'), []);
    assert.deepEqual(selected, ['£']);
  });
});
