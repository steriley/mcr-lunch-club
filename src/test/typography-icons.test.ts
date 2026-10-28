import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The typography and icon rules from src/styles/theme.css: public templates and
 * components draw icons with the SVG Icon component, never emoji, and do not put
 * the serif on a wrapper where it would cascade into paragraphs.
 */

const SRC = path.resolve('src');
// Text-style marks (arrows, check, cross, command) are typography, not emoji.
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[⚖⌖]/u;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['admin', 'test'].includes(entry.name) ? [] : files(full);
    return /\.(astro|vue|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

const publicFiles = ['pages', 'components', 'layouts', 'lib'].flatMap((dir) =>
  files(path.join(SRC, dir))
);

describe('typography and icons', () => {
  it('has no emoji in public templates, components or tier data', () => {
    const offenders = publicFiles.filter((file) => EMOJI.test(readFileSync(file, 'utf8')));
    assert.deepEqual(
      offenders.map((file) => path.relative(SRC, file)),
      []
    );
  });

  it('keeps the serif off page and section wrappers', () => {
    const wrappers = /<(?:article|section|main|div class="max-w-[^"]*")[^>]*font-serif-header/;
    const offenders = publicFiles.filter((file) => wrappers.test(readFileSync(file, 'utf8')));
    assert.deepEqual(
      offenders.map((file) => path.relative(SRC, file)),
      []
    );
  });
});
