import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('returns an empty string for empty input', () => {
    assert.equal(renderMarkdown(''), '');
    assert.equal(renderMarkdown(null), '');
  });

  it('renders paragraphs, emphasis and line breaks', () => {
    assert.equal(
      renderMarkdown('A **firm** yes.\nWith *chips*.\n\nSecond'),
      '<p>A <strong>firm</strong> yes.<br>With <em>chips</em>.</p>\n<p>Second</p>'
    );
  });

  it('renders lists, headings and quotes', () => {
    assert.equal(renderMarkdown('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
    assert.equal(renderMarkdown('1. one\n2. two'), '<ol><li>one</li><li>two</li></ol>');
    assert.equal(renderMarkdown('## Verdict'), '<h4>Verdict</h4>');
    assert.equal(renderMarkdown('> Sublime'), '<blockquote><p>Sublime</p></blockquote>');
  });

  it('escapes raw HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>');
    assert.ok(!html.includes('<script'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('only links to safe URLs', () => {
    assert.equal(
      renderMarkdown('[menu](https://example.com/a?b=1&c=2)'),
      '<p><a href="https://example.com/a?b=1&amp;c=2" rel="nofollow noopener noreferrer">menu</a></p>'
    );
    assert.ok(!renderMarkdown('[x](javascript:alert(1))').includes('<a'));
    assert.ok(!renderMarkdown('[x](https://e.com" onmouseover="alert(1))').includes('onmouseover="'));
  });

  it('does not format inside code spans', () => {
    assert.equal(renderMarkdown('`**raw**`'), '<p><code>**raw**</code></p>');
  });
});
