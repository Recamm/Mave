type AccountReference = { id: string };

const preferenceKey = (ownerId: string) => `mave.selected-account.${ownerId}`;

export function getPrimaryAccountId(
  ownerId: string,
  accounts: readonly AccountReference[],
  storage?: Storage,
): string {
  const fallbackAccountId = accounts[0]?.id ?? '';

  try {
    const accountId = (storage ?? window.localStorage).getItem(preferenceKey(ownerId));
    return accounts.some((account) => account.id === accountId)
      ? (accountId ?? fallbackAccountId)
      : fallbackAccountId;
  } catch {
    return fallbackAccountId;
  }
}

export function savePrimaryAccountId(ownerId: string, accountId: string, storage?: Storage): void {
  try {
    (storage ?? window.localStorage).setItem(preferenceKey(ownerId), accountId);
  } catch {
    return;
  }
}
