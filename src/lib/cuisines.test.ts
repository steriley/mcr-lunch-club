import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CUISINES,
  CUISINE_VALUES,
  LEGACY_CUISINE_MAP,
  cuisineLabel,
  isCuisineValue,
  mapLegacyCuisine,
  parseCuisine,
  type CuisineValue,
} from './cuisines';

// The 35 free-text values in use before the fixed list (issue #10).
const LEGACY: Record<CuisineValue, string[]> = {
  pizza: ['Detroit Pan Pizza', 'NYC Style Pizza', 'Neapolitan Pizza', 'Pizza', 'Pizza & Slices'],
  fast_food: [
    'Burgers',
    'Burgers & Loaded Fries',
    'Smash Burgers',
    'Fried Chicken',
    'Louisiana Fried Chicken',
    'Nashville Hot Chicken',
    'Wings',
    'Wings & Dive Bar',
  ],
  fish_and_chips: ['Fish & Chips', 'Traditional Chippy'],
  sandwiches_subs: ['Deli & Sandwiches', 'Gourmet Subs', 'Italian-American Subs', 'Grilled Cheese'],
  bakery_cafe: ['Bakery & Toasties', 'Cafe & Bakes', 'Deli & Bakery'],
  asian: ['Asian Noodles & Soups', 'Cantonese BBQ', 'Chinese Street Food', 'Ramen', 'Wok Noodles'],
  indian: ['Indian', "Rice 'n' Three"],
  middle_eastern_mediterranean: ['Levantine / Shawarma', 'Greek Street Food'],
  mexican: ['Mexican / Burritos'],
  steak_grill: ['Steakhouse', 'Brazilian Rodizio'],
  other: ['Casual Dining'],
};

describe('CUISINES', () => {
  it('has the eleven categories with Other last', () => {
    assert.deepEqual(CUISINE_VALUES, [
      'asian',
      'bakery_cafe',
      'fast_food',
      'fish_and_chips',
      'indian',
      'mexican',
      'middle_eastern_mediterranean',
      'pizza',
      'sandwiches_subs',
      'steak_grill',
      'other',
    ]);
    assert.equal(CUISINES.at(-1)?.label, 'Other');
  });

  it('labels values and recognises them', () => {
    assert.equal(cuisineLabel('middle_eastern_mediterranean'), 'Middle Eastern & Mediterranean');
    assert.equal(isCuisineValue('pizza'), true);
    assert.equal(isCuisineValue('Pizza'), false);
    assert.equal(isCuisineValue(null), false);
  });
});

describe('parseCuisine', () => {
  it('accepts a stored value or a label in any case', () => {
    assert.equal(parseCuisine('fish_and_chips'), 'fish_and_chips');
    assert.equal(parseCuisine('Fish & Chips'), 'fish_and_chips');
    assert.equal(parseCuisine('  sandwiches & SUBS '), 'sandwiches_subs');
  });

  it('returns null when unrecognised', () => {
    assert.equal(parseCuisine('Thai'), null);
    assert.equal(parseCuisine(''), null);
    assert.equal(parseCuisine(null), null);
  });
});

describe('mapLegacyCuisine', () => {
  const all = Object.entries(LEGACY).flatMap(([category, values]) =>
    values.map((value) => [value, category] as const)
  );

  it('covers all 35 legacy values', () => {
    assert.equal(all.length, 35);
  });

  for (const [raw, expected] of all) {
    it(`maps "${raw}" to ${expected}`, () => {
      assert.equal(mapLegacyCuisine(raw), expected);
    });
  }

  it('handles HTML-escaped ampersands, whitespace, case and curly quotes', () => {
    assert.equal(mapLegacyCuisine('Pizza &amp; Slices'), 'pizza');
    assert.equal(mapLegacyCuisine('  burgers &AMP; loaded   fries  '), 'fast_food');
    assert.equal(mapLegacyCuisine('Rice ’n’ Three'), 'indian');
  });

  it('maps null, empty and unknown values to Other', () => {
    assert.equal(mapLegacyCuisine(null), 'other');
    assert.equal(mapLegacyCuisine(''), 'other');
    assert.equal(mapLegacyCuisine('   '), 'other');
    assert.equal(mapLegacyCuisine('Thai Curry'), 'other');
  });

  it('accepts values that are already categories', () => {
    assert.equal(mapLegacyCuisine('Steak & Grill'), 'steak_grill');
    assert.equal(mapLegacyCuisine('mexican'), 'mexican');
  });
});

describe('migration 0005', () => {
  it('uses the same legacy mapping as mapLegacyCuisine', () => {
    const sql = readFileSync('drizzle/0005_fixed_cuisines.sql', 'utf8');
    const rows = new Map(
      [...sql.matchAll(/^\s+\('((?:[^']|'')+)', '([a-z_]+)'\)/gm)].map((match) => [
        match[1].replace(/''/g, "'"),
        match[2],
      ])
    );
    for (const [raw, value] of Object.entries(LEGACY_CUISINE_MAP)) {
      assert.equal(rows.get(raw), value, raw);
    }
    for (const cuisine of CUISINES) {
      assert.equal(rows.get(cuisine.value), cuisine.value);
      assert.equal(rows.get(cuisine.label.toLowerCase()), cuisine.value);
    }
    for (const [raw, value] of rows) {
      assert.equal(mapLegacyCuisine(raw), value, raw);
    }
  });
});
