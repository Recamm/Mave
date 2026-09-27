import { getSupabaseClient } from '../../lib/supabase/client';
import type { Json } from '../../lib/supabase/database.types';
import type { Movement, MovementSyncStatus } from '../movements/movementService';
import type { MovementInput } from '../movements/movementInput';
import { createOutboxStore, type OutboxAction, type OutboxEntry } from './outbox';

type RpcResult = {
  conflict_id?: string | null;
  movement?: unknown;
  status: 'applied' | 'blocked' | 'conflict';
};

export type MovementChange = {
  action: OutboxAction;
  expectedVersion: number | null;
  movementId?: string;
  ownerId: string;
  payload: MovementInput | null;
};

export type SyncOutcome = {
  conflictId: string | null;
  discardedPendingCount?: number;
  movementId: string;
  movement: Movement | null;
  operationId: string;
  status: MovementSyncStatus;
};

export type MovementConflictRevision = {
  action: OutboxAction;
  expectedVersion: number;
  id: string;
  payload: MovementInput;
  source: 'server' | 'client';
};

export type MovementConflict = {
  conflictId: string;
  movementId: string;
  operationId: string | null;
  revisions: MovementConflictRevision[];
};

type SyncEngineOptions = {
  createId?: () => string;
  isOnline?: () => boolean;
  outbox?: ReturnType<typeof createOutboxStore>;
};

export function createSyncEngine({
  createId = () => crypto.randomUUID(),
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine,
  outbox = createOutboxStore(),
}: SyncEngineOptions = {}) {
  async function submitMovementChange(change: MovementChange): Promise<SyncOutcome> {
    const entry = await outbox.enqueue({
      action: change.action,
      expectedVersion: change.expectedVersion,
      movementId: change.movementId ?? (change.action === 'create' ? createId() : ''),
      operationId: createId(),
      ownerId: change.ownerId,
      payload: change.payload,
    });

    if (!isOnline()) {
      return outcomeFromEntry(entry);
    }

    return synchronizeEntry(entry);
  }

  async function synchronizePending(ownerId: string): Promise<SyncOutcome[]> {
    if (!ownerId || !isOnline()) {
      return [];
    }

    const entries = await outbox.list(ownerId);
    if (entries.length === 0) {
      return [];
    }

    const previouslyBlocked = entries.find(
      (entry) => entry.status === 'blocked' && entry.lastErrorCode === 'account_expired',
    );
    if (previouslyBlocked) {
      return [await purgeExpiredOutbox(previouslyBlocked)];
    }

    const pendingEntries = entries.filter(
      (entry) =>
        entry.status === 'pending' || entry.status === 'retry' || entry.status === 'sending',
    );
    if (pendingEntries.length === 0) {
      const accountSyncAllowed = await checkAccountSyncAllowed(ownerId);
      if (accountSyncAllowed === false) {
        const firstEntry = entries[0];
        return firstEntry ? [await purgeExpiredOutbox(firstEntry)] : [];
      }
      return [];
    }

    const outcomes: SyncOutcome[] = [];

    for (const entry of pendingEntries) {
      const outcome = await synchronizeEntry(entry);
      outcomes.push(outcome);
      if (outcome.status === 'blocked') {
        break;
      }
    }

    return outcomes;
  }

  async function getPendingCount(ownerId: string): Promise<number> {
    return (await outbox.list(ownerId)).length;
  }

  async function listOpenConflicts(ownerId: string): Promise<MovementConflict[]> {
    const client = await getClientForOwner(ownerId);
    if (!client) {
      return [];
    }

    const { data: conflicts, error: conflictError } = await client
      .from('movement_conflicts')
      .select('id,movement_id,opened_at')
      .eq('status', 'open')
      .order('opened_at', { ascending: true });

    if (conflictError) {
      throw conflictError;
    }
    if (conflicts.length === 0) {
      return [];
    }

    const conflictIds = conflicts.map((conflict) => conflict.id);
    const { data: revisions, error: revisionError } = await client
      .from('movement_conflict_revisions')
      .select(
        'id,conflict_id,source,action,expected_version,kind,amount_text,currency,category_id,occurred_on,financial_account_id,note',
      )
      .in('conflict_id', conflictIds)
      .order('captured_at', { ascending: true });

    if (revisionError) {
      throw revisionError;
    }

    const entries = await outbox.list(ownerId);
    return conflicts.map((conflict) => {
      const conflictRevisions = revisions
        .filter((revision) => revision.conflict_id === conflict.id)
        .map((revision) => ({
          action: revision.action,
          expectedVersion: revision.expected_version,
          id: revision.id,
          payload: {
            amount: revision.amount_text,
            categoryId: revision.category_id,
            currency: revision.currency,
            financialAccountId: revision.financial_account_id,
            kind: revision.kind,
            note: revision.note,
            occurredOn: revision.occurred_on,
          },
          source: revision.source,
        }));
      const pendingOperation = entries.reduce<OutboxEntry | null>(
        (latest, entry) =>
          entry.status === 'conflict' && entry.movementId === conflict.movement_id ? entry : latest,
        null,
      );

      return {
        conflictId: conflict.id,
        movementId: conflict.movement_id,
        operationId: pendingOperation?.operationId ?? null,
        revisions: conflictRevisions,
      };
    });
  }

  async function resolveMovementConflict(
    ownerId: string,
    conflict: MovementConflict,
    revisionId: string,
  ): Promise<SyncOutcome> {
    const client = await getClientForOwner(ownerId);
    if (!client) {
      throw new Error('The active account cannot resolve this conflict.');
    }

    const operationId = conflict.operationId ?? conflict.conflictId;
    const { data, error } = await client.rpc('resolve_movement_conflict', {
      p_conflict_id: conflict.conflictId,
      p_operation_id: operationId,
      p_revision_id: revisionId,
    });

    if (error) {
      if (error.code === '42501' && (await checkAccountSyncAllowed(ownerId)) === false) {
        return purgeExpiredOutbox({ movementId: conflict.movementId, operationId, ownerId });
      }
      throw error;
    }

    const result = data as unknown as { movement?: unknown; status: string };
    if (result.status === 'blocked') {
      return purgeExpiredOutbox({ movementId: conflict.movementId, operationId, ownerId });
    }
    if (result.status !== 'resolved' || !result.movement) {
      throw new Error('Conflict resolution returned an invalid result.');
    }

    if (conflict.operationId) {
      await outbox.complete(ownerId, conflict.operationId);
    }

    return {
      conflictId: null,
      movementId: conflict.movementId,
      movement: mapRpcMovement(result.movement, 'synced'),
      operationId,
      status: 'synced',
    };
  }

  async function listVisibleMovements(
    ownerId: string,
    canonicalMovements: Movement[],
  ): Promise<Movement[]> {
    const movementsById = new Map<string, Movement>(
      canonicalMovements.map((movement): [string, Movement] => [
        movement.id,
        { ...movement, syncStatus: 'synced' },
      ]),
    );

    for (const entry of await outbox.list(ownerId)) {
      const canonical = movementsById.get(entry.movementId);

      if (entry.status === 'conflict' && canonical) {
        movementsById.set(entry.movementId, { ...canonical, syncStatus: 'conflict' });
        continue;
      }

      const localMovement = movementFromEntry(entry, canonical);
      if (localMovement) {
        movementsById.set(entry.movementId, localMovement);
      } else {
        movementsById.delete(entry.movementId);
      }
    }

    return [...movementsById.values()].sort(sortByDate);
  }

  async function synchronizeEntry(entry: OutboxEntry): Promise<SyncOutcome> {
    const client = await getClientForOwner(entry.ownerId);
    if (!client) {
      return outcomeFromEntry(entry);
    }

    await outbox.updateStatus(entry.ownerId, entry.operationId, 'sending');

    let response;
    try {
      response = await client.rpc('apply_movement_change', {
        p_action: entry.action,
        p_expected_version: entry.expectedVersion,
        p_movement_id: entry.movementId,
        p_operation_id: entry.operationId,
        p_payload: toJsonPayload(entry.payload),
      });
    } catch {
      await outbox.updateStatus(entry.ownerId, entry.operationId, 'retry', 'network');
      return outcomeFromEntry({ ...entry, status: 'retry', lastErrorCode: 'network' });
    }

    const { data, error } = response;
    if (error) {
      if (error.code === '42501') {
        if ((await checkAccountSyncAllowed(entry.ownerId)) === false) {
          return purgeExpiredOutbox(entry);
        }

        await outbox.updateStatus(entry.ownerId, entry.operationId, 'blocked', 'authorization');
        return outcomeFromEntry({ ...entry, status: 'blocked', lastErrorCode: 'authorization' });
      }
      await outbox.updateStatus(entry.ownerId, entry.operationId, 'retry', 'network');
      return outcomeFromEntry({ ...entry, status: 'retry', lastErrorCode: 'network' });
    }

    const result = data as unknown as RpcResult;
    if (result.status === 'blocked') {
      return purgeExpiredOutbox(entry);
    }

    try {
      if (result.status === 'applied') {
        await outbox.complete(entry.ownerId, entry.operationId);
        const movement = result.movement ? mapRpcMovement(result.movement, 'synced') : null;
        return {
          conflictId: null,
          movementId: entry.movementId,
          movement: movement?.deleted_at ? null : movement,
          operationId: entry.operationId,
          status: 'synced',
        };
      }

      if (result.status === 'conflict') {
        await outbox.updateStatus(entry.ownerId, entry.operationId, 'conflict', 'version');
        const movement = result.movement ? mapRpcMovement(result.movement, 'conflict') : null;
        return {
          conflictId: result.conflict_id ?? null,
          movementId: entry.movementId,
          movement,
          operationId: entry.operationId,
          status: 'conflict',
        };
      }

      throw new Error('Movement sync returned an unknown result.');
    } catch {
      await outbox.updateStatus(entry.ownerId, entry.operationId, 'retry', 'network');
      return outcomeFromEntry({ ...entry, status: 'retry', lastErrorCode: 'network' });
    }
  }

  async function checkAccountSyncAllowed(ownerId: string): Promise<boolean | null> {
    const client = await getClientForOwner(ownerId);
    if (!client) {
      return null;
    }

    const { data, error } = await client.rpc('account_sync_allowed', {});
    if (error) {
      throw error;
    }

    return data;
  }

  async function purgeExpiredOutbox(
    entry: Pick<OutboxEntry, 'movementId' | 'operationId' | 'ownerId'>,
  ): Promise<SyncOutcome> {
    const discardedPendingCount = await outbox.purgeOwner(entry.ownerId);
    return {
      conflictId: null,
      discardedPendingCount,
      movementId: entry.movementId,
      movement: null,
      operationId: entry.operationId,
      status: 'blocked',
    };
  }

  return {
    getPendingCount,
    listOpenConflicts,
    listVisibleMovements,
    resolveMovementConflict,
    submitMovementChange,
    synchronizePending,
  };
}

function outcomeFromEntry(entry: OutboxEntry): SyncOutcome {
  return {
    conflictId: null,
    movementId: entry.movementId,
    movement: movementFromEntry(entry),
    operationId: entry.operationId,
    status: entry.status,
  };
}

function movementFromEntry(entry: OutboxEntry, previous?: Movement): Movement | null {
  const payload = entry.payload;
  if (entry.action === 'delete' || !payload) {
    return null;
  }

  return {
    amount: payload.amount,
    category_id: payload.categoryId,
    created_at: previous?.created_at ?? entry.createdAt,
    currency: payload.currency,
    deleted_at: null,
    financial_account_id: payload.financialAccountId,
    id: entry.movementId,
    kind: payload.kind,
    note: payload.note,
    occurred_on: payload.occurredOn,
    syncStatus: entry.status,
    updated_at: entry.createdAt,
    user_id: entry.ownerId,
    version: entry.expectedVersion ?? 1,
  };
}

function mapRpcMovement(value: unknown, syncStatus: MovementSyncStatus): Movement {
  if (!value || typeof value !== 'object') {
    throw new Error('Movement sync response is invalid.');
  }

  const row = value as Record<string, unknown>;
  const amount = typeof row.amount_text === 'string' ? row.amount_text : null;
  if (
    !amount ||
    typeof row.category_id !== 'string' ||
    typeof row.created_at !== 'string' ||
    (row.currency !== 'ARS' && row.currency !== 'USD') ||
    typeof row.id !== 'string' ||
    (row.kind !== 'income' && row.kind !== 'expense') ||
    typeof row.occurred_on !== 'string' ||
    typeof row.updated_at !== 'string' ||
    typeof row.user_id !== 'string' ||
    typeof row.version !== 'number'
  ) {
    throw new Error('Movement sync response is incomplete.');
  }

  return {
    amount,
    category_id: row.category_id,
    created_at: row.created_at,
    currency: row.currency,
    deleted_at: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    financial_account_id:
      typeof row.financial_account_id === 'string' ? row.financial_account_id : null,
    id: row.id,
    kind: row.kind,
    note: typeof row.note === 'string' ? row.note : null,
    occurred_on: row.occurred_on,
    syncStatus,
    updated_at: row.updated_at,
    user_id: row.user_id,
    version: row.version,
  };
}

function toJsonPayload(payload: MovementInput | null): Json | null {
  if (!payload) {
    return null;
  }

  return {
    amount: payload.amount,
    category_id: payload.categoryId,
    currency: payload.currency,
    financial_account_id: payload.financialAccountId,
    kind: payload.kind,
    note: payload.note,
    occurred_on: payload.occurredOn,
  };
}

function sortByDate(left: Movement, right: Movement): number {
  return (
    right.occurred_on.localeCompare(left.occurred_on) ||
    right.created_at.localeCompare(left.created_at) ||
    left.id.localeCompare(right.id)
  );
}

async function getClientForOwner(
  ownerId: string,
): Promise<NonNullable<ReturnType<typeof getSupabaseClient>> | null> {
  const client = getSupabaseClient();
  if (!client || !ownerId) {
    return null;
  }

  try {
    const { data, error } = await client.auth.getSession();
    return !error && data.session?.user.id === ownerId ? client : null;
  } catch {
    return null;
  }
}

export const syncEngine = createSyncEngine();
