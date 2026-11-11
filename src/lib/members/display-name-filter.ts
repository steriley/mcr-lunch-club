import { DataSet, englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

/**
 * The profanity check on member display names (#136). Server-only: it runs when a name is saved
 * (src/lib/members/profiles.ts) and never ships to the browser, so it costs the public pages
 * nothing. `obscenity` handles look-alike characters ("sh1t", "fμck"); the check also runs on the
 * name with letters spelled out one at a time joined up, which catches "f u c k" and "s-h-i-t".
 * Whole words are never joined: "Dan Alexander" or "Diana Lyons" run together would match.
 *
 * It leaves real names and places alone where it can: "Scunthorpe" and "Cockburn" already pass,
 * and the terms below are allowed explicitly. Anything it misses, the Chairs hide from the
 * Members list.
 */

const dataset = new DataSet<{ originalWord: string }>()
  .addAll(englishDataset)
  // Penistone, South Yorkshire.
  .addPhrase((phrase) =>
    phrase.setMetadata({ originalWord: 'penis' }).addWhitelistedTerm('penistone')
  )
  // Fukuoka, Japan.
  .addPhrase((phrase) =>
    phrase.setMetadata({ originalWord: 'fuck' }).addWhitelistedTerm('fukuoka')
  );

const matcher = new RegExpMatcher({ ...dataset.build(), ...englishRecommendedTransformers });

/** Joins runs of single characters ("f u c k", "s-h-i-t"); words keep a space between them. */
function joinSpelledOut(name: string): string {
  const tokens = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const single = (token: string) => [...token].length === 1;
  return tokens
    .map((token, index) =>
      index === 0 || (single(token) && single(tokens[index - 1])) ? token : ` ${token}`
    )
    .join('');
}

export function isOffensiveName(name: string): boolean {
  return matcher.hasMatch(name) || matcher.hasMatch(joinSpelledOut(name));
}
