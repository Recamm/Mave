import { beforeEach, describe, expect, it } from 'vitest';
import { readOwnerLookups } from '../../../src/features/sync/ownerLookupCache';

const ownerId = '10000000-0000-0000-0000-000000000001';

describe('owner lookup cache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('treats accounts without archived_at from older caches as active', () => {
    localStorage.setItem(
      `mave:owner-lookups:v1:${ownerId}`,
      JSON.stringify({
        version: 1,
        categories: [],
        financialAccounts: [
          { id: '20000000-0000-0000-0000-000000000001', name: 'Efectivo', currency: 'ARS' },
        ],
      }),
    );

    expect(readOwnerLookups(ownerId)?.financialAccounts).toEqual([
      {
        id: '20000000-0000-0000-0000-000000000001',
        name: 'Efectivo',
        currency: 'ARS',
        archived_at: null,
      },
    ]);
  });
});
