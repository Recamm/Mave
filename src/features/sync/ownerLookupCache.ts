import type { Category } from '../categories/categoryService';
import type { FinancialAccountOption } from '../movements/movementService';

type OwnerLookupSnapshot = {
  categories: Category[];
  financialAccounts: FinancialAccountOption[];
};

type StoredOwnerLookupSnapshot = OwnerLookupSnapshot & {
  version: 1;
};

const cacheKeyPrefix = 'mave:owner-lookups:v1:';

export function readOwnerLookups(ownerId: string): OwnerLookupSnapshot | null {
  const storage = getStorage();
  if (!storage || !ownerId) {
    return null;
  }

  try {
    const serialized = storage.getItem(`${cacheKeyPrefix}${ownerId}`);
    if (!serialized) {
      return null;
    }

    const snapshot = JSON.parse(serialized) as Partial<StoredOwnerLookupSnapshot>;
    if (
      snapshot.version !== 1 ||
      !Array.isArray(snapshot.categories) ||
      !snapshot.categories.every(isCategory) ||
      !Array.isArray(snapshot.financialAccounts) ||
      !snapshot.financialAccounts.every(isFinancialAccount)
    ) {
      return null;
    }

    return {
      categories: snapshot.categories,
      financialAccounts: snapshot.financialAccounts,
    };
  } catch {
    return null;
  }
}

export function writeOwnerLookups(ownerId: string, snapshot: OwnerLookupSnapshot): void {
  const storage = getStorage();
  if (!storage || !ownerId) {
    return;
  }

  try {
    const storedSnapshot: StoredOwnerLookupSnapshot = { ...snapshot, version: 1 };
    storage.setItem(`${cacheKeyPrefix}${ownerId}`, JSON.stringify(storedSnapshot));
  } catch {
    return;
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isCategory(value: unknown): value is Category {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const category = value as Record<string, unknown>;
  return (
    typeof category.id === 'string' &&
    typeof category.name === 'string' &&
    (category.source === 'default' || category.source === 'custom') &&
    (typeof category.archived_at === 'string' || category.archived_at === null)
  );
}

function isFinancialAccount(value: unknown): value is FinancialAccountOption {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const account = value as Record<string, unknown>;
  return (
    typeof account.id === 'string' &&
    typeof account.name === 'string' &&
    (account.currency === 'ARS' || account.currency === 'USD')
  );
}
