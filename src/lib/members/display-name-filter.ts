import { DataSet, englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

/**
 * The profanity check on member display names (#136). Server-only: it runs when a name is saved
 * (src/lib/members/profiles.ts) and never ships to the browser, so it costs the public pages
 * nothing. `obscenity` handles look-alike characters ("sh1t", "fμck"); the check also runs on the
 * name with its spaces and punctuation taken out, which catches "f u c k" and "s-h-i-t".
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

export function isOffensiveName(name: string): boolean {
  return matcher.hasMatch(name) || matcher.hasMatch(name.replace(/[^\p{L}\p{N}]+/gu, ''));
}
