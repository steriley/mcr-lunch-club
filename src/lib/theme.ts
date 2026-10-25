/**
 * Light or dark. The head script (src/components/ThemeScript.astro) sets
 * `data-theme` on <html> before the page paints, from the visitor's saved
 * choice or their system setting; the toggle changes it and fires
 * THEME_CHANGE_EVENT so things CSS can't restyle (map tiles, SVG overlays)
 * can follow.
 */
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mcr-theme';
export const THEME_CHANGE_EVENT = 'mcr:themechange';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** Runs `callback` whenever the theme changes; returns the unsubscribe. */
export function onThemeChange(callback: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = () => callback(currentTheme());
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}
