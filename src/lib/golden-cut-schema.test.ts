import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_DISH_MAX, PUFF_PIECE_MAX, goldenCutInputSchema } from './golden-cut-schema';

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe('goldenCutInputSchema', () => {
  it('accepts up to five venues and turns blank text into null', () => {
    const parsed = goldenCutInputSchema.parse({
      entries: [{ venueId: id(1), puffPiece: '  The best.  ', anchorDish: '   ' }, ...[2, 3, 4, 5].map((n) => ({ venueId: id(n) }))],
    });
    assert.equal(parsed.entries.length, 5);
    assert.equal(parsed.entries[0].puffPiece, 'The best.');
    assert.equal(parsed.entries[0].anchorDish, null);
    assert.equal(parsed.entries[1].puffPiece, null);
  });

  it('accepts an empty list', () => {
    assert.deepEqual(goldenCutInputSchema.parse({ entries: [] }).entries, []);
  });

  it('rejects a sixth venue', () => {
    const result = goldenCutInputSchema.safeParse({ entries: [1, 2, 3, 4, 5, 6].map((n) => ({ venueId: id(n) })) });
    assert.equal(result.success, false);
    assert.match(result.error!.issues[0].message, /at most 5/);
  });

  it('rejects the same venue twice', () => {
    const result = goldenCutInputSchema.safeParse({ entries: [{ venueId: id(1) }, { venueId: id(1) }] });
    assert.equal(result.success, false);
    assert.match(result.error!.issues[0].message, /only appear once/);
  });

  it('rejects bad ids and over-long text', () => {
    assert.equal(goldenCutInputSchema.safeParse({ entries: [{ venueId: 'nope' }] }).success, false);
    assert.equal(goldenCutInputSchema.safeParse({ entries: [{ venueId: id(1), puffPiece: 'x'.repeat(PUFF_PIECE_MAX + 1) }] }).success, false);
    assert.equal(goldenCutInputSchema.safeParse({ entries: [{ venueId: id(1), anchorDish: 'x'.repeat(ANCHOR_DISH_MAX + 1) }] }).success, false);
    assert.equal(goldenCutInputSchema.safeParse({}).success, false);
  });
});
