import { createHash } from 'node:crypto';

/**
 * The inline theme script in ThemeScript.astro. It lives here so astro.config.mjs can
 * add its hash to the Content-Security-Policy: Astro hashes is:inline scripts on
 * prerendered pages only, and on-demand pages (sign-in, the Chairs' Area) send their
 * policy before a component could add it.
 *
 * Runs before the page paints, so there is no flash of the wrong theme.
 * Keep the key and event names in step with src/lib/theme.ts.
 */
export const THEME_SCRIPT = `(() => {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const saved = () => {
    try {
      const value = localStorage.getItem('mcr-theme');
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  };
  const apply = (theme) => {
    root.dataset.theme = theme;
    if (meta) meta.setAttribute('content', meta.dataset[theme] || meta.content);
  };
  const resolve = () => saved() ?? (system.matches ? 'dark' : 'light');
  apply(resolve());
  // With no saved choice ("System"), follow the system setting as it changes.
  system.addEventListener('change', () => {
    if (saved()) return;
    apply(resolve());
    window.dispatchEvent(new CustomEvent('mcr:themechange'));
  });
  // A choice made in another tab applies here too.
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== 'mcr-theme') return;
    apply(resolve());
    window.dispatchEvent(new CustomEvent('mcr:themechange'));
  });
  window.__mcrApplyTheme = apply;
})();`;

export const THEME_SCRIPT_HASH =
  `sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}` as const;
