import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Every date a person reads comes from src/lib/dates.ts. This fails the test
 * run when date formatting appears anywhere else in src/. For a legitimate
 * non-display use, put `// dates-guard:allow <reason>` on the same or the
 * preceding line.
 */

const ROOT = path.resolve('src');
const EXEMPT = new Set(['lib/dates.ts', 'lib/dates.test.ts', 'lib/dates.guard.test.ts']);
const FORBIDDEN: Array<[RegExp, string]> = [
  [/\btoLocaleDateString\b/, 'toLocaleDateString'],
  [/\btoLocaleTimeString\b/, 'toLocaleTimeString'],
  [/\btoLocaleString\b/, 'toLocaleString'],
  [/\bIntl\s*\.\s*DateTimeFormat\b/, 'Intl.DateTimeFormat'],
  [/\btoDateString\b/, 'toDateString'],
  [/\bdateStyle\b/, 'dateStyle'],
  [/\btimeStyle\b/, 'timeStyle'],
];
const ALLOW = /dates-guard:allow\s+\S/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? files(full) : /\.(astro|ts|vue)$/.test(entry.name) ? [full] : [];
  });
}

/** "file:line uses X" for each forbidden use without a reasoned allow comment. */
function findViolations(source: string, file: string): string[] {
  const lines = source.split('\n');
  return lines.flatMap((line, index) => {
    if (ALLOW.test(line) || (index > 0 && ALLOW.test(lines[index - 1]))) return [];
    return FORBIDDEN.filter(([pattern]) => pattern.test(line)).map(
      ([, name]) => `${file}:${index + 1} uses ${name}`
    );
  });
}

describe('dates guard', () => {
  it('finds no date formatting outside src/lib/dates.ts', () => {
    const violations = files(ROOT)
      .map((file) => path.relative(ROOT, file).split(path.sep).join('/'))
      .filter((file) => !EXEMPT.has(file))
      .flatMap((file) =>
        findViolations(readFileSync(path.join(ROOT, file), 'utf8'), `src/${file}`)
      );
    assert.deepEqual(
      violations,
      [],
      `Format displayed dates with formatDate / formatDateTime from src/lib/dates.ts:\n  ${violations.join('\n  ')}`
    );
  });

  it('catches a deliberately added toLocaleDateString', () => {
    assert.deepEqual(
      findViolations("const a = 1;\nconst when = date.toLocaleDateString('en-GB');", 'src/x.ts'),
      ['src/x.ts:2 uses toLocaleDateString']
    );
    assert.deepEqual(findViolations("{ dateStyle: 'medium' }", 'src/x.vue'), [
      'src/x.vue:1 uses dateStyle',
    ]);
  });

  it('accepts an allow comment with a reason on the same or the preceding line', () => {
    assert.deepEqual(
      findViolations('n.toLocaleString(); // dates-guard:allow number formatting', 'src/x.ts'),
      []
    );
    assert.deepEqual(
      findViolations(
        '// dates-guard:allow machine-readable day\nnew Intl.DateTimeFormat()',
        'src/x.ts'
      ),
      []
    );
  });

  it('rejects an allow comment without a reason', () => {
    assert.equal(findViolations('n.toLocaleString(); // dates-guard:allow', 'src/x.ts').length, 1);
  });
});
