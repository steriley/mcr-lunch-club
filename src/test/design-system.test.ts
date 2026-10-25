import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * House rules for the look of the site, checked against the source so they
 * survive later edits. The type is Playfair Display for headings and Plus
 * Jakarta Sans for everything else; figures that need to line up use
 * `tabular-nums`, never a monospaced font. Colours are the theme tokens in
 * src/styles/global.css (`@theme`), used as utilities (`text-ink`) or
 * variables (`var(--color-ink)`), never as raw hex.
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

  it('uses colour tokens instead of hex colour classes', () => {
    const hexClass = /[a-z0-9]-\[#[0-9a-f]{3,8}\]/i;
    for (const file of sourceFiles(SRC)) {
      if (file.endsWith('.css')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        assert.ok(!hexClass.test(line), `${path.relative(SRC, file)}:${index + 1} has a hex colour class: use a token (src/styles/global.css)`);
      });
    }
  });

  it('keeps raw hex in global.css to the token definitions', () => {
    const css = readFileSync(path.join(SRC, 'styles/global.css'), 'utf8');
    const afterTheme = css.slice(css.indexOf('@layer base'));
    const withoutComments = afterTheme.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepEqual(withoutComments.match(/#[0-9a-f]{3,8}\b/gi) ?? [], [], 'raw hex outside @theme: add a token instead');
  });
});
