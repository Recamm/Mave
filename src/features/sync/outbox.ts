import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { MovementInput } from '../movements/movementInput';

export type OutboxStatus = 'pending' | 'sending' | 'retry' | 'conflict' | 'blocked';
export type OutboxAction = 'create' | 'update' | 'delete';

export type OutboxMutation = {
  action: OutboxAction;
  expectedVersion: number | null;
  movementId: string;
  operationId: string;
  ownerId: string;
  payload: MovementInput | null;
};

export type OutboxEntry = OutboxMutation & {
  createdAt: string;
  lastErrorCode: string | null;
  status: OutboxStatus;
};

type OutboxDatabase = {
  operations: {
    key: [ownerId: string, operationId: string];
    value: OutboxEntry;
    indexes: { 'by-owner': string };
  };
} & DBSchema;

type OutboxStoreOptions = {
  databaseName?: string;
};

const defaultDatabaseName = 'mave-movement-outbox';
const allowedTransitions: Record<OutboxStatus, readonly OutboxStatus[]> = {
  pending: ['sending', 'blocked'],
  sending: ['retry', 'conflict', 'blocked'],
  retry: ['sending', 'blocked'],
  conflict: [],
  blocked: [],
};

export function createOutboxStore({ databaseName = defaultDatabaseName }: OutboxStoreOptions = {}) {
  let databasePromise: Promise<IDBPDatabase<OutboxDatabase>> | null = null;

  function getDatabase(): Promise<IDBPDatabase<OutboxDatabase>> {
    databasePromise ??= openDB<OutboxDatabase>(databaseName, 1, {
      upgrade(database) {
        const operations = database.createObjectStore('operations', {
          keyPath: ['ownerId', 'operationId'],
        });
        operations.createIndex('by-owner', 'ownerId');
      },
    });

    return databasePromise;
  }

  return {
    async enqueue(mutation: OutboxMutation): Promise<OutboxEntry> {
      validateMutation(mutation);

      const database = await getDatabase();
      const transaction = database.transaction('operations', 'readwrite');
      const key: [string, string] = [mutation.ownerId, mutation.operationId];
      const existing = await transaction.store.get(key);

      if (existing) {
        if (!hasSameMutation(existing, mutation)) {
          throw new Error('Operation id has already been used with different data.');
        }

        return existing;
      }

      const entry: OutboxEntry = {
        ...mutation,
        createdAt: new Date().toISOString(),
        lastErrorCode: null,
        status: 'pending',
      };
      await transaction.store.add(entry);
      await transaction.done;
      return entry;
    },

    async list(ownerId: string): Promise<OutboxEntry[]> {
      const database = await getDatabase();
      const entries = await database.getAllFromIndex('operations', 'by-owner', ownerId);
      return entries.sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.operationId.localeCompare(right.operationId),
      );
    },

    async updateStatus(
      ownerId: string,
      operationId: string,
      status: OutboxStatus,
      errorCode: string | null = null,
    ): Promise<OutboxEntry> {
      const database = await getDatabase();
      const transaction = database.transaction('operations', 'readwrite');
      const key: [string, string] = [ownerId, operationId];
      const current = await transaction.store.get(key);

      if (!current) {
        throw new Error('Outbox operation is unavailable.');
      }

      if (current.status !== status && !allowedTransitions[current.status].includes(status)) {
        throw new Error(`Cannot transition outbox operation from ${current.status} to ${status}.`);
      }

      const updated: OutboxEntry = {
        ...current,
        lastErrorCode: status === 'pending' || status === 'sending' ? null : errorCode,
        status,
      };
      await transaction.store.put(updated);
      await transaction.done;
      return updated;
    },

    async complete(ownerId: string, operationId: string): Promise<void> {
      const database = await getDatabase();
      await database.delete('operations', [ownerId, operationId]);
    },
  };
}

function validateMutation(mutation: OutboxMutation): void {
  const hasPayload = mutation.action !== 'delete';

  if (!mutation.ownerId || !mutation.operationId || !mutation.movementId) {
    throw new Error('Outbox owner, operation, and movement ids are required.');
  }

  if (hasPayload !== (mutation.payload !== null)) {
    throw new Error('Outbox action and payload do not match.');
  }

  if (
    (mutation.action === 'create' && mutation.expectedVersion !== null) ||
    (mutation.action !== 'create' &&
      (!Number.isInteger(mutation.expectedVersion) || (mutation.expectedVersion ?? 0) < 1))
  ) {
    throw new Error('Outbox expected version does not match the action.');
  }
}

function hasSameMutation(existing: OutboxEntry, mutation: OutboxMutation): boolean {
  return (
    existing.action === mutation.action &&
    existing.expectedVersion === mutation.expectedVersion &&
    existing.movementId === mutation.movementId &&
    existing.ownerId === mutation.ownerId &&
    existing.operationId === mutation.operationId &&
    JSON.stringify(existing.payload) === JSON.stringify(mutation.payload)
  );
}
