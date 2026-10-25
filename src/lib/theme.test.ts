import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { currentTheme, isThemePreference, resolveTheme, themePreference } from './theme';

describe('theme', () => {
  it('accepts light, dark and system as preferences', () => {
    for (const value of ['light', 'dark', 'system']) assert.ok(isThemePreference(value), value);
    for (const value of ['auto', '', null, undefined]) assert.ok(!isThemePreference(value), String(value));
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
