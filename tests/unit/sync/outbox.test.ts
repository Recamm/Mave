import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createOutboxStore, type OutboxMutation } from '../../../src/features/sync/outbox';
import type { MovementInput } from '../../../src/features/movements/movementInput';

let databaseSequence = 0;

const ownerOne = '10000000-0000-0000-0000-000000000001';
const ownerTwo = '10000000-0000-0000-0000-000000000002';
const movementId = '30000000-0000-0000-0000-000000000001';
const operationId = '40000000-0000-0000-0000-000000000001';
const blockedOperationId = '40000000-0000-0000-0000-000000000002';
const accountId = '50000000-0000-0000-0000-000000000001';

const movementInput: MovementInput = {
  amount: '12.50',
  categoryId: '20000000-0000-0000-0000-000000000001',
  currency: 'ARS',
  financialAccountId: null,
  kind: 'expense',
  note: 'Compra offline',
  occurredOn: '2026-09-26',
};

function createStore() {
  const databaseName = `mave-outbox-test-${++databaseSequence}`;

  return {
    databaseName,
    store: createOutboxStore({ databaseName }),
  };
}

function createMutation(ownerId: string, overrides: Partial<OutboxMutation> = {}): OutboxMutation {
  return {
    action: 'create',
    expectedVersion: null,
    movementId,
    operationId,
    ownerId,
    payload: movementInput,
    ...overrides,
  };
}

describe('movement outbox', () => {
  it('persists pending operations and only lists them for their owner', async () => {
    const { databaseName, store } = createStore();
    const mutation = createMutation(ownerOne);

    await store.enqueue(mutation);

    const reopenedStore = createOutboxStore({ databaseName });
    const ownerOperations = await reopenedStore.list(ownerOne);

    expect(ownerOperations).toHaveLength(1);
    expect(ownerOperations[0]).toMatchObject({
      ...mutation,
      status: 'pending',
    });
    expect(ownerOperations[0]?.payload?.amount).toBe('12.50');
    expect(await reopenedStore.list(ownerTwo)).toEqual([]);
  });

  it('detects unsynchronized operations that reference an account for the same owner', async () => {
    const { store } = createStore();
    await store.enqueue(
      createMutation(ownerOne, {
        payload: { ...movementInput, financialAccountId: accountId },
      }),
    );

    await expect(store.hasPendingAccountReference(ownerOne, accountId)).resolves.toBe(true);
    await expect(store.hasPendingAccountReference(ownerOne, 'another-account')).resolves.toBe(
      false,
    );
    await expect(store.hasPendingAccountReference(ownerTwo, accountId)).resolves.toBe(false);
  });

  it('records sending, retry, conflict, and blocked states', async () => {
    const { store } = createStore();
    await store.enqueue(createMutation(ownerOne));

    await store.updateStatus(ownerOne, operationId, 'sending');
    const retry = await store.updateStatus(ownerOne, operationId, 'retry', 'network');
    expect(retry).toMatchObject({ status: 'retry', lastErrorCode: 'network' });

    await store.updateStatus(ownerOne, operationId, 'sending');
    const conflict = await store.updateStatus(ownerOne, operationId, 'conflict', 'version');
    expect(conflict).toMatchObject({ status: 'conflict', lastErrorCode: 'version' });

    await store.enqueue(createMutation(ownerOne, { operationId: blockedOperationId }));
    await store.updateStatus(ownerOne, blockedOperationId, 'sending');
    const blocked = await store.updateStatus(
      ownerOne,
      blockedOperationId,
      'blocked',
      'account_expired',
    );
    expect(blocked).toMatchObject({ status: 'blocked', lastErrorCode: 'account_expired' });
  });

  it('deduplicates an identical operation and rejects a reused id with different data', async () => {
    const { store } = createStore();
    const mutation = createMutation(ownerOne);

    const original = await store.enqueue(mutation);
    const duplicate = await store.enqueue(mutation);

    expect(duplicate).toEqual(original);
    await expect(
      store.enqueue({
        ...mutation,
        payload: { ...movementInput, amount: '15.00' },
      }),
    ).rejects.toThrow();
    expect(await store.list(ownerOne)).toHaveLength(1);
  });

  it('removes an operation only when the caller completes it', async () => {
    const { store } = createStore();
    await store.enqueue(createMutation(ownerOne));

    await store.complete(ownerOne, operationId);

    expect(await store.list(ownerOne)).toEqual([]);
  });

  it('purges every operation for one owner without affecting another owner', async () => {
    const { store } = createStore();
    await store.enqueue(createMutation(ownerOne));
    await store.enqueue(createMutation(ownerOne, { operationId: blockedOperationId }));
    await store.enqueue(createMutation(ownerTwo));

    expect(await store.purgeOwner(ownerOne)).toBe(2);
    expect(await store.list(ownerOne)).toEqual([]);
    expect(await store.list(ownerTwo)).toHaveLength(1);
  });
});
