import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMobileNavigationStyle,
  getMobileNavigationStyle,
  saveMobileNavigationStyle,
} from '../../../src/app/mobileNavigation';

describe('mobile navigation preference', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('defaults to a normal bottom bar', () => {
    expect(getMobileNavigationStyle()).toBe('normal');
  });

  it('persists the selected layout', () => {
    saveMobileNavigationStyle('floating');

    expect(getMobileNavigationStyle()).toBe('floating');
  });

  it('falls back to normal for invalid stored values', () => {
    window.localStorage.setItem('mave.mobile-navigation-style', 'compact');

    expect(getMobileNavigationStyle()).toBe('normal');
  });

  it('applies the layout to the document root', () => {
    const root = document.createElement('html');

    applyMobileNavigationStyle('floating', root);

    expect(root.dataset.mobileNavigation).toBe('floating');
  });
});
