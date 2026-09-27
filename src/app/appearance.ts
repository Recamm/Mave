export type AppearancePreference = 'light' | 'dark' | 'system';
export type ResolvedAppearance = Exclude<AppearancePreference, 'system'>;

const appearanceStorageKey = 'mave.appearance';
const appearancePreferences: AppearancePreference[] = ['light', 'dark', 'system'];

export function getAppearancePreference(
  storage: Storage = window.localStorage,
): AppearancePreference {
  const preference = storage.getItem(appearanceStorageKey);

  return appearancePreferences.includes(preference as AppearancePreference)
    ? (preference as AppearancePreference)
    : 'dark';
}

export function saveAppearancePreference(
  preference: AppearancePreference,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(appearanceStorageKey, preference);
}

export function resolveAppearancePreference(
  preference: AppearancePreference,
  prefersDark: boolean,
): ResolvedAppearance {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

export function applyAppearancePreference(
  preference: AppearancePreference,
  root: HTMLElement = document.documentElement,
  prefersDark = systemPrefersDark(),
): void {
  const resolvedAppearance = resolveAppearancePreference(preference, prefersDark);
  root.dataset.appearance = preference;
  root.dataset.theme = resolvedAppearance;
  root.style.colorScheme = resolvedAppearance;
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}
