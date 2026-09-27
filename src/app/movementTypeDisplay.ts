export type MovementTypeDisplayPreference = 'words' | 'symbols';
export type MovementKindDisplay = 'income' | 'expense';

const preferenceKey = 'mave.movement-type-display';
const preferences: MovementTypeDisplayPreference[] = ['words', 'symbols'];

export function getMovementTypeDisplayPreference(storage?: Storage): MovementTypeDisplayPreference {
  try {
    const preference = (storage ?? window.localStorage).getItem(preferenceKey);

    return preferences.includes(preference as MovementTypeDisplayPreference)
      ? (preference as MovementTypeDisplayPreference)
      : 'words';
  } catch {
    return 'words';
  }
}

export function saveMovementTypeDisplayPreference(
  preference: MovementTypeDisplayPreference,
  storage?: Storage,
): void {
  try {
    (storage ?? window.localStorage).setItem(preferenceKey, preference);
  } catch {
    return;
  }
}

export function getMovementTypeLabel(
  kind: MovementKindDisplay,
  preference: MovementTypeDisplayPreference,
): string {
  if (preference === 'symbols') {
    return kind === 'income' ? '+' : '-';
  }

  return kind === 'income' ? 'Ingreso' : 'Egreso';
}
