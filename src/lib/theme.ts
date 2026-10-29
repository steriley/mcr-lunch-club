/**
 * Light or dark. The visitor picks light, dark or "system" (follow the OS
 * setting); light and dark are saved, system clears the saved choice. The head
 * script (src/components/ThemeScript.astro) sets `data-theme` on <html> before
 * the page paints and keeps it in step with the system setting and other tabs;
 * the footer switch changes it and fires THEME_CHANGE_EVENT so things CSS
 * can't restyle (map tiles, SVG overlays) can follow.
 */
export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

const THEME_STORAGE_KEY = 'mcr-theme';
export const THEME_CHANGE_EVENT = 'mcr:themechange';

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark';
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return isTheme(value) || value === 'system';
}

/** The theme a preference comes to, given whether the system is set to dark. */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** The visitor's saved choice, or "system" when there isn't one. */
export function themePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Saves the visitor's choice (system clears it), applies it and announces the change. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Private windows can refuse storage; the choice then lasts for this page.
  }
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  (window as unknown as { __mcrApplyTheme?: (theme: Theme) => void }).__mcrApplyTheme?.(
    resolveTheme(preference, systemPrefersDark)
  );
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference } }));
}

/** Runs `callback` whenever the theme changes; returns the unsubscribe. */
export function onThemeChange(callback: (theme: Theme) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = () => callback(currentTheme());
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}
