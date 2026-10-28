/**
 * The single source of truth for venue cuisines: stored values (database,
 * API) and display labels (admin UI, public site). Other is always last.
 */
export const CUISINES = [
  { value: 'asian', label: 'Asian' },
  { value: 'bakery_cafe', label: 'Bakery & Cafe' },
  { value: 'fast_food', label: 'Fast Food' },
  { value: 'fish_and_chips', label: 'Fish & Chips' },
  { value: 'indian', label: 'Indian' },
  { value: 'mexican', label: 'Mexican' },
  { value: 'middle_eastern_mediterranean', label: 'Middle Eastern & Mediterranean' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'sandwiches_subs', label: 'Sandwiches & Subs' },
  { value: 'steak_grill', label: 'Steak & Grill' },
  { value: 'other', label: 'Other' },
] as const;

export type CuisineValue = (typeof CUISINES)[number]['value'];
export type CuisineLabel = (typeof CUISINES)[number]['label'];

export const CUISINE_VALUES = CUISINES.map((cuisine) => cuisine.value) as [
  CuisineValue,
  ...CuisineValue[],
];

export const DEFAULT_CUISINE: CuisineValue = 'other';

export function isCuisineValue(value: unknown): value is CuisineValue {
  return CUISINES.some((cuisine) => cuisine.value === value);
}

export function cuisineLabel(value: CuisineValue): CuisineLabel {
  return CUISINES.find((cuisine) => cuisine.value === value)!.label;
}

/** Accepts a stored value or a display label (any case); returns null when unrecognised. */
export function parseCuisine(input: string | null | undefined): CuisineValue | null {
  const needle = String(input ?? '')
    .trim()
    .toLowerCase();
  const match = CUISINES.find(
    (cuisine) => cuisine.value === needle || cuisine.label.toLowerCase() === needle
  );
  return match?.value ?? null;
}

/** The free-text cuisines used before the fixed list, folded into categories. */
export const LEGACY_CUISINE_MAP: Readonly<Record<string, CuisineValue>> = {
  'detroit pan pizza': 'pizza',
  'nyc style pizza': 'pizza',
  'neapolitan pizza': 'pizza',
  pizza: 'pizza',
  'pizza & slices': 'pizza',
  burgers: 'fast_food',
  'burgers & loaded fries': 'fast_food',
  'smash burgers': 'fast_food',
  'fried chicken': 'fast_food',
  'louisiana fried chicken': 'fast_food',
  'nashville hot chicken': 'fast_food',
  wings: 'fast_food',
  'wings & dive bar': 'fast_food',
  'fish & chips': 'fish_and_chips',
  'traditional chippy': 'fish_and_chips',
  'deli & sandwiches': 'sandwiches_subs',
  'gourmet subs': 'sandwiches_subs',
  'italian-american subs': 'sandwiches_subs',
  'grilled cheese': 'sandwiches_subs',
  'bakery & toasties': 'bakery_cafe',
  'cafe & bakes': 'bakery_cafe',
  'deli & bakery': 'bakery_cafe',
  'asian noodles & soups': 'asian',
  'cantonese bbq': 'asian',
  'chinese street food': 'asian',
  ramen: 'asian',
  'wok noodles': 'asian',
  indian: 'indian',
  "rice 'n' three": 'indian',
  'levantine / shawarma': 'middle_eastern_mediterranean',
  'greek street food': 'middle_eastern_mediterranean',
  'mexican / burritos': 'mexican',
  steakhouse: 'steak_grill',
  'brazilian rodizio': 'steak_grill',
  'casual dining': 'other',
};

/** Normalises a legacy cuisine for lookup: `&amp;` becomes `&`, curly quotes go straight, trimmed, lower case. */
export function normaliseLegacyCuisine(raw: string): string {
  return raw
    .replace(/&amp;/gi, '&')
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Maps a free-text cuisine from before the fixed list; anything unknown, empty or null is Other. */
export function mapLegacyCuisine(raw: string | null): CuisineValue {
  if (raw === null) return DEFAULT_CUISINE;
  const normalised = normaliseLegacyCuisine(raw);
  return LEGACY_CUISINE_MAP[normalised] ?? parseCuisine(normalised) ?? DEFAULT_CUISINE;
}
