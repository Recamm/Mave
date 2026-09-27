export type MobileNavigationStyle = 'normal' | 'floating';

const preferenceKey = 'mave.mobile-navigation-style';
const navigationStyles: MobileNavigationStyle[] = ['normal', 'floating'];

export function getMobileNavigationStyle(
  storage: Storage = window.localStorage,
): MobileNavigationStyle {
  try {
    const style = storage.getItem(preferenceKey);
    return navigationStyles.includes(style as MobileNavigationStyle)
      ? (style as MobileNavigationStyle)
      : 'normal';
  } catch {
    return 'normal';
  }
}

export function saveMobileNavigationStyle(
  style: MobileNavigationStyle,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(preferenceKey, style);
}

export function applyMobileNavigationStyle(
  style: MobileNavigationStyle,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.mobileNavigation = style;
}
