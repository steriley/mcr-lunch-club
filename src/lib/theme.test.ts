import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentTheme,
  isThemePreference,
  onThemeChange,
  resolveTheme,
  setThemePreference,
  themePreference,
  THEME_CHANGE_EVENT,
} from './theme';

describe('theme', () => {
  it('accepts light, dark and system as preferences', () => {
    for (const value of ['light', 'dark', 'system']) assert.ok(isThemePreference(value), value);
    for (const value of ['auto', '', null, undefined])
      assert.ok(!isThemePreference(value), String(value));
  });

  it('follows the system only when the preference is system', () => {
    assert.equal(resolveTheme('system', true), 'dark');
    assert.equal(resolveTheme('system', false), 'light');
    assert.equal(resolveTheme('light', true), 'light');
    assert.equal(resolveTheme('dark', false), 'dark');
  });

  it('falls back to light and system outside a browser', () => {
    assert.equal(currentTheme(), 'light');
    assert.equal(themePreference(), 'system');
  });
});

const globals = globalThis as Record<string, unknown>;
const original = {
  window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
  document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
  localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
};

function define(name: keyof typeof original, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/** A minimal browser: storage, a document with data-theme, and a window that records events. */
function fakeBrowser({ systemDark = false, storageThrows = false } = {}) {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<() => void>>();
  const applied: string[] = [];
  const events: { type: string; detail: unknown }[] = [];
  const refuse = () => {
    throw new Error('storage refused');
  };
  define('localStorage', {
    getItem: storageThrows ? refuse : (key: string) => store.get(key) ?? null,
    setItem: storageThrows ? refuse : (key: string, value: string) => void store.set(key, value),
    removeItem: storageThrows ? refuse : (key: string) => void store.delete(key),
  });
  const documentElement = { dataset: {} as Record<string, string> };
  define('document', { documentElement });
  define('window', {
    matchMedia: () => ({ matches: systemDark }),
    __mcrApplyTheme: (theme: string) => {
      applied.push(theme);
      documentElement.dataset.theme = theme;
    },
    dispatchEvent: (event: { type: string; detail: unknown }) => {
      events.push({ type: event.type, detail: event.detail });
      listeners.get(event.type)?.forEach((listener) => listener());
      return true;
    },
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
  });
  return { store, applied, events, documentElement, listeners };
}

describe('theme in a browser', () => {
  afterEach(() => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globals[name];
    }
  });

  it('reads a saved light or dark choice and ignores anything else', () => {
    const { store } = fakeBrowser();
    assert.equal(themePreference(), 'system');
    store.set('mcr-theme', 'dark');
    assert.equal(themePreference(), 'dark');
    store.set('mcr-theme', 'light');
    assert.equal(themePreference(), 'light');
    store.set('mcr-theme', 'sepia');
    assert.equal(themePreference(), 'system');
  });

  it('reads the theme the head script put on <html>', () => {
    const { documentElement } = fakeBrowser();
    assert.equal(currentTheme(), 'light');
    documentElement.dataset.theme = 'dark';
    assert.equal(currentTheme(), 'dark');
  });

  it('saves light and dark, applies them and announces the change', () => {
    const { store, applied, events } = fakeBrowser({ systemDark: true });
    setThemePreference('light');
    assert.equal(store.get('mcr-theme'), 'light');
    setThemePreference('dark');
    assert.equal(store.get('mcr-theme'), 'dark');
    assert.deepEqual(applied, ['light', 'dark']);
    assert.deepEqual(events, [
      { type: THEME_CHANGE_EVENT, detail: { preference: 'light' } },
      { type: THEME_CHANGE_EVENT, detail: { preference: 'dark' } },
    ]);
  });

  it('clears the saved choice for system and follows the OS setting', () => {
    const dark = fakeBrowser({ systemDark: true });
    dark.store.set('mcr-theme', 'light');
    setThemePreference('system');
    assert.equal(dark.store.has('mcr-theme'), false);
    assert.deepEqual(dark.applied, ['dark']);

    const light = fakeBrowser({ systemDark: false });
    setThemePreference('system');
    assert.deepEqual(light.applied, ['light']);
  });

  it('still applies the choice when storage refuses', () => {
    const { applied, events } = fakeBrowser({ storageThrows: true });
    assert.equal(themePreference(), 'system');
    setThemePreference('dark');
    assert.deepEqual(applied, ['dark']);
    assert.equal(events.length, 1);
  });

  it('notifies subscribers with the current theme until they unsubscribe', () => {
    fakeBrowser();
    const seen: string[] = [];
    const stop = onThemeChange((theme) => seen.push(theme));
    setThemePreference('dark');
    setThemePreference('light');
    stop();
    setThemePreference('dark');
    assert.deepEqual(seen, ['dark', 'light']);
  });
});
