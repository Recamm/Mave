export type AppIconPreference = 'dark' | 'light';

export const appIconOptions = [
  {
    label: 'Oscuro',
    value: 'dark',
    src: './icons/apple-touch-icon-dark.png',
  },
  {
    label: 'Claro',
    value: 'light',
    src: './icons/apple-touch-icon-light.png',
  },
] as const satisfies readonly {
  label: string;
  value: AppIconPreference;
  src: string;
}[];

const appIconStorageKey = 'mave.app-icon';
const appIconPreferences = appIconOptions.map((option) => option.value);
const legacyAppIconPreferences: Record<string, AppIconPreference> = {
  classic: 'light',
  night: 'dark',
  lavender: 'light',
  coral: 'light',
};

export function getAppIconPreference(storage: Storage = window.localStorage): AppIconPreference {
  const preference = storage.getItem(appIconStorageKey);

  if (appIconPreferences.includes(preference as AppIconPreference)) {
    return preference as AppIconPreference;
  }

  return legacyAppIconPreferences[preference ?? ''] ?? 'dark';
}

export function saveAppIconPreference(
  preference: AppIconPreference,
  storage: Storage = window.localStorage,
): void {
  storage.setItem(appIconStorageKey, preference);
}

export function applyAppIconPreference(
  preference: AppIconPreference,
  appleTouchIcon: HTMLLinkElement | null = document.querySelector('link[rel="apple-touch-icon"]'),
): void {
  const option = appIconOptions.find((candidate) => candidate.value === preference);
  if (option) {
    appleTouchIcon?.setAttribute('href', option.src);
  }
}
