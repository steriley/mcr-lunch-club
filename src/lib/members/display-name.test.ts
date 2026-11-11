import '@/test/setup-env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { displayNameKey, displayNameSchema, profileUpdateSchema } from '@/lib/members/display-name';
import { isOffensiveName } from '@/lib/members/display-name-filter';
import { isFreshSignIn } from '@/lib/members/profiles';

describe('display names (#136)', () => {
  it('normalises spacing and Unicode before checking', () => {
    assert.equal(displayNameSchema.parse('  Pie   Inspector '), 'Pie Inspector');
    // Full-width letters fold to ASCII (NFKC).
    assert.equal(displayNameSchema.parse('Ｓam'), 'Sam');
  });

  it('accepts 2 to 30 letters, digits, spaces, apostrophes, hyphens and full stops', () => {
    for (const name of ['Jo', 'Sam O’Brien', 'Anne-Marie', 'Dr. Gravy', 'Zoë', 'Lunch 2026']) {
      assert.ok(displayNameSchema.safeParse(name).success, name);
    }
    for (const name of ['J', 'a'.repeat(31), '<b>Sam</b>', 'sam@example.com', '2026', '   ']) {
      assert.ok(!displayNameSchema.safeParse(name).success, name);
    }
  });

  it('compares names ignoring case, spacing and apostrophe style', () => {
    assert.equal(displayNameKey('Sam  O’Brien'), displayNameKey("sam o'brien"));
    assert.notEqual(displayNameKey('Sam'), displayNameKey('Sam2'));
  });

  it('wants something to change', () => {
    assert.ok(!profileUpdateSchema.safeParse({}).success);
    assert.ok(profileUpdateSchema.safeParse({ showPublicly: false }).success);
  });
});

describe('the display-name profanity filter (#136)', () => {
  it('catches look-alike characters and spacing tricks', () => {
    for (const name of ['shit', 'Sh1t Lord', 'f u c k', 's-h-i-t', 'f.u.c.k', 'C0ck', 'fμck']) {
      assert.ok(isOffensiveName(name), name);
    }
  });

  it('accepts real names and places that naive filters block', () => {
    for (const name of [
      'Scunthorpe',
      'Cockburn',
      'Penistone Road',
      'Penistone',
      'Sam Cockburn',
      'Hancock',
      'Middlesex',
      'Assam Tea',
      'Fukuoka',
      'Grass Hopper',
      // Ordinary names that only spell something when their words are run together.
      'Dan Alexander',
      'Ana Lopez',
      'Diana Lyons',
      'Susan Alder',
      'Pen Island',
    ]) {
      assert.ok(!isOffensiveName(name), name);
    }
  });
});

describe('a fresh sign-in (#136)', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it('lasts ten minutes', () => {
    assert.ok(isFreshSignIn(new Date('2026-11-10T11:55:00Z'), now));
    assert.ok(isFreshSignIn('2026-11-10T11:50:00Z', now));
    assert.ok(!isFreshSignIn(new Date('2026-11-10T11:49:59Z'), now));
    assert.ok(!isFreshSignIn(new Date('2026-11-10T12:01:00Z'), now));
  });
});
