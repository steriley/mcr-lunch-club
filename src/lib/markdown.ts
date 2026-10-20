/**
 * Minimal, safe Markdown for venue verdicts.
 *
 * All input is HTML-escaped before any formatting is applied, so raw HTML in
 * the source can never reach the page; links are limited to http(s)/mailto.
 * Supports paragraphs, line breaks, headings (#–###), bullet and numbered
 * lists, block quotes, **bold**, *italic*, `code` and [links](https://…).
 * Shared by the public venue page and the admin preview.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_URL = /^(https?:\/\/|mailto:)[^\s]+$/i;

function renderInline(escaped: string): string {
  const codeSpans: string[] = [];
  let text = escaped.replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label: string, url: string) => {
    if (!SAFE_URL.test(url)) return match;
    return `<a href="${url}" rel="nofollow noopener noreferrer">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_\w])_([^_\s][^_]*?)_(?![_\w])/g, '$1<em>$2</em>');

  return text.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => codeSpans[Number(index)]);
}

type Block =
  | { type: 'paragraph'; lines: string[] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; lines: string[] };

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*+]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);

    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
    } else if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const item = (bullet ?? numbered)![1];
      const open = current as Block | null;
      if (open?.type === 'list' && open.ordered === ordered) {
        open.items.push(item);
      } else {
        flush();
        current = { type: 'list', ordered, items: [item] };
      }
    } else if (quote) {
      const open = current as Block | null;
      if (open?.type === 'quote') {
        open.lines.push(quote[1]);
      } else {
        flush();
        current = { type: 'quote', lines: [quote[1]] };
      }
    } else {
      const open = current as Block | null;
      if (open?.type === 'paragraph') {
        open.lines.push(line);
      } else {
        flush();
        current = { type: 'paragraph', lines: [line] };
      }
    }
  }
  flush();
  return blocks;
}

export function renderMarkdown(source: string | null | undefined): string {
  if (!source?.trim()) return '';

  return parseBlocks(source)
    .map((block) => {
      switch (block.type) {
        case 'heading': {
          // Verdict headings sit under the page's own headings.
          const tag = `h${block.level + 2}`;
          return `<${tag}>${renderInline(escapeHtml(block.text))}</${tag}>`;
        }
        case 'list': {
          const tag = block.ordered ? 'ol' : 'ul';
          const items = block.items.map((item) => `<li>${renderInline(escapeHtml(item))}</li>`).join('');
          return `<${tag}>${items}</${tag}>`;
        }
        case 'quote':
          return `<blockquote><p>${block.lines.map((line) => renderInline(escapeHtml(line))).join('<br>')}</p></blockquote>`;
        case 'paragraph':
          return `<p>${block.lines.map((line) => renderInline(escapeHtml(line.trim()))).join('<br>')}</p>`;
      }
    })
    .join('\n');
}
