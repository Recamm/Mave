import { afterEach, describe, expect, it } from 'vitest';
import {
  applyAppearancePreference,
  getAppearancePreference,
  resolveAppearancePreference,
  saveAppearancePreference,
} from '../../../src/app/appearance';

describe('appearance preferences', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses the system preference when no choice has been saved', () => {
    expect(getAppearancePreference()).toBe('system');
  });

  it.each(['light', 'dark', 'system'] as const)(
    'persists and restores the %s preference',
    (preference) => {
      saveAppearancePreference(preference);

      expect(getAppearancePreference()).toBe(preference);
    },
  );

  it('falls back to the system preference for invalid stored values', () => {
    window.localStorage.setItem('mave.appearance', 'sepia');

    expect(getAppearancePreference()).toBe('system');
  });

  it('resolves system appearance from the operating system preference', () => {
    expect(resolveAppearancePreference('system', false)).toBe('light');
    expect(resolveAppearancePreference('system', true)).toBe('dark');
    expect(resolveAppearancePreference('light', true)).toBe('light');
    expect(resolveAppearancePreference('dark', false)).toBe('dark');
  });

  it('applies the preference and resolved color scheme to the document root', () => {
    const root = document.createElement('html');

    applyAppearancePreference('system', root, true);

    expect(root.dataset.appearance).toBe('system');
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
  });
});
