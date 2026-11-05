import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('Vercel Web Analytics', () => {
  it('loads the first-party script, external so the CSP needs no new hash or host', () => {
    const component = read('components/WebAnalytics.astro');
    assert.match(component, /src="\/_vercel\/insights\/script\.js"/);
    assert.doesNotMatch(component, /https?:\/\//, 'no third-party host');
  });

  it("is on the public layout, skipping noindex pages, and never in the Chairs' Area", () => {
    assert.match(read('layouts/Layout.astro'), /!noindex && <WebAnalytics \/>/);
    assert.doesNotMatch(read('layouts/AdminLayout.astro'), /WebAnalytics|_vercel\/insights/);
  });
});
