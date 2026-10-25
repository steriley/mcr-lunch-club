import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * House rules for the look of the site, checked against the source so they
 * survive later edits. The type is Playfair Display for headings and Plus
 * Jakarta Sans for everything else; figures that need to line up use
 * `tabular-nums`, never a monospaced font.
 */

const SRC = path.resolve('src');
const STYLED = ['.vue', '.astro', '.css', '.ts'];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (entry.name.endsWith('.test.ts')) return [];
    return STYLED.includes(path.extname(entry.name)) ? [full] : [];
  });
}

describe('design system', () => {
  it('uses no monospaced fonts', () => {
    const monospace = /(?<![\w:-])font-mono(?![\w-])|\bmonospace\b|ui-monospace/;
    for (const file of sourceFiles(SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        assert.ok(!monospace.test(line), `${path.relative(SRC, file)}:${index + 1} uses a monospaced font: use tabular-nums instead`);
      });
    }
  });
});
