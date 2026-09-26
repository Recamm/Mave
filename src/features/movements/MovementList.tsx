import { useEffect, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { useAuthSession } from '../../app/useAuthSession';
import { CategoryManager } from '../categories/CategoryManager';
import { categoryService, type Category } from '../categories/categoryService';
import { MovementForm } from './MovementForm';
import type { MovementInput } from './movementInput';
import { movementService, type FinancialAccountOption, type Movement } from './movementService';
import { PeriodSummary } from '../summaries/PeriodSummaryView';
import { MovementHistory } from '../summaries/MovementHistory';
import { getCurrentPeriod } from '../summaries/periodSummary';
import { summaryService } from '../summaries/summaryService';
import { refundService, type Refund } from './refundService';
import { readOwnerLookups, writeOwnerLookups } from '../sync/ownerLookupCache';
import { ConflictResolver } from '../sync/ConflictResolver';
import {
  syncEngine,
  type MovementConflict,
  type MovementConflictRevision,
  type SyncOutcome,
} from '../sync/syncEngine';

export function MovementList() {
  const { session } = useAuthSession();
  const ownerId = session?.user.id ?? null;
  const [categories, setCategories] = useState<Category[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccountOption[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [conflicts, setConflicts] = useState<MovementConflict[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [period, setPeriod] = useState(() => getCurrentPeriod());
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setConflicts([]);

    async function loadPage() {
      const cachedLookups = ownerId ? readOwnerLookups(ownerId) : null;
      let localMovements: Movement[] = [];

      if (ownerId) {
        try {
          localMovements = await syncEngine.listVisibleMovements(ownerId, []);
        } catch {
          setLoadFailed(true);
        }
      }

      if (!isCurrent) {
        return;
      }

      setCategories(cachedLookups?.categories ?? []);
      setMovements(localMovements);
      setRefunds([]);
      setFinancialAccounts(cachedLookups?.financialAccounts ?? []);
      setLoadFailed(cachedLookups === null && ownerId !== null);
      setIsLoading(false);

      const readsPromise = Promise.all([
        categoryService.listCategories(),
        summaryService.listPeriodRecords(),
        movementService.listFinancialAccounts(),
      ]);
      const syncPromise = ownerId ? syncEngine.synchronizePending(ownerId) : Promise.resolve([]);
      const [readResult, syncResult] = await Promise.allSettled([readsPromise, syncPromise]);

      if (!isCurrent) {
        return;
      }

      let visibleMovements = localMovements;
      if (readResult.status === 'fulfilled') {
        const [loadedCategories, periodRecords, loadedAccounts] = readResult.value;
        visibleMovements = ownerId
          ? await syncEngine.listVisibleMovements(ownerId, periodRecords.movements)
          : periodRecords.movements;
        setCategories(loadedCategories);
        setRefunds(periodRecords.refunds);
        setFinancialAccounts(loadedAccounts);
        setLoadFailed(false);

        if (ownerId) {
          writeOwnerLookups(ownerId, {
            categories: loadedCategories,
            financialAccounts: loadedAccounts,
          });
        }
      } else if (cachedLookups === null && ownerId !== null) {
        setLoadFailed(true);
      }

      if (syncResult.status === 'fulfilled') {
        visibleMovements = applySyncResults(visibleMovements, syncResult.value);
      }

      let openConflicts: MovementConflict[] = [];
      if (ownerId) {
        try {
          openConflicts = await syncEngine.listOpenConflicts(ownerId);
        } catch {
          openConflicts = [];
        }
      }

      if (!isCurrent) {
        return;
      }

      setConflicts(openConflicts);
      setMovements(visibleMovements);
      setIsLoading(false);
    }

    void loadPage();
    return () => {
      isCurrent = false;
    };
  }, [ownerId]);

  useEffect(() => {
    const activeOwnerId = ownerId;
    if (!activeOwnerId) {
      return;
    }

    let isCurrent = true;
    let isSynchronizing = false;

    async function synchronizeOnResume(syncOwnerId: string) {
      if (isSynchronizing || !navigator.onLine || document.visibilityState !== 'visible') {
        return;
      }

      isSynchronizing = true;
      try {
        const results = await syncEngine.synchronizePending(syncOwnerId);
        const [periodRecords, openConflicts] = await Promise.all([
          summaryService.listPeriodRecords(),
          syncEngine.listOpenConflicts(syncOwnerId),
        ]);
        const visibleMovements = await syncEngine.listVisibleMovements(
          syncOwnerId,
          periodRecords.movements,
        );

        if (!isCurrent) {
          return;
        }

        setMovements(applySyncResults(visibleMovements, results));
        setRefunds(periodRecords.refunds);
        setConflicts(openConflicts);
      } catch {
        return;
      } finally {
        isSynchronizing = false;
      }
    }

    const handleResume = () => {
      if (activeOwnerId) {
        void synchronizeOnResume(activeOwnerId);
      }
    };
    document.addEventListener('visibilitychange', handleResume);
    window.addEventListener('focus', handleResume);
    window.addEventListener('online', handleResume);

    return () => {
      isCurrent = false;
      document.removeEventListener('visibilitychange', handleResume);
      window.removeEventListener('focus', handleResume);
      window.removeEventListener('online', handleResume);
    };
  }, [ownerId]);

  async function refreshCategories() {
    const updatedCategories = await categoryService.listCategories();
    setCategories(updatedCategories);
    if (ownerId) {
      writeOwnerLookups(ownerId, { categories: updatedCategories, financialAccounts });
    }
  }

  async function refreshPeriodRecords() {
    const periodRecords = await summaryService.listPeriodRecords();
    setMovements(periodRecords.movements);
    setRefunds(periodRecords.refunds);
  }

  async function handleDeleteRefund(refund: Refund) {
    if (!window.confirm('¿Eliminar esta devolución?')) {
      return;
    }

    try {
      await refundService.recordRefund({
        action: 'delete',
        operationId: crypto.randomUUID(),
        refundId: refund.id,
        expenseId: null,
        amount: null,
        receivedOn: null,
        expectedVersion: refund.version,
      });
      await refreshPeriodRecords();
      setActionError(false);
    } catch {
      setActionError(true);
    }
  }

  async function handleSave(input: MovementInput) {
    if (!ownerId) {
      throw new Error('Authenticated owner is unavailable.');
    }

    const result = await syncEngine.submitMovementChange({
      action: editingMovement ? 'update' : 'create',
      expectedVersion: editingMovement?.version ?? null,
      movementId: editingMovement?.id,
      ownerId,
      payload: input,
    });

    setMovements((current) => {
      if (!result.movement) {
        return current.filter((movement) => movement.id !== editingMovement?.id);
      }

      const withoutSavedMovement = current.filter(
        (movement) => movement.id !== result.movement?.id,
      );
      return [result.movement, ...withoutSavedMovement].sort(sortByDate);
    });
    setEditingMovement(null);
    setActionError(false);
  }

  async function handleDelete(movement: Movement) {
    if (!window.confirm('¿Eliminar este movimiento?')) {
      return;
    }

    try {
      if (!ownerId) {
        throw new Error('Authenticated owner is unavailable.');
      }

      const result = await syncEngine.submitMovementChange({
        action: 'delete',
        expectedVersion: movement.version,
        movementId: movement.id,
        ownerId,
        payload: null,
      });
      setMovements((current) =>
        result.movement
          ? [result.movement, ...current.filter((item) => item.id !== movement.id)].sort(sortByDate)
          : current.filter((item) => item.id !== movement.id),
      );
      setActionError(false);
    } catch {
      setActionError(true);
    }
  }

  async function handleResolveConflict(
    conflict: MovementConflict,
    revision: MovementConflictRevision,
  ) {
    if (!ownerId) {
      return;
    }

    try {
      const result = await syncEngine.resolveMovementConflict(ownerId, conflict, revision.id);
      setMovements((current) => {
        const remaining = current.filter((movement) => movement.id !== result.movementId);
        return result.movement && !result.movement.deleted_at
          ? [result.movement, ...remaining].sort(sortByDate)
          : remaining;
      });
      setConflicts((current) => current.filter((item) => item.conflictId !== conflict.conflictId));
      setActionError(false);
    } catch {
      setActionError(true);
    }
  }

  return (
    <main className="movement-page">
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Libro personal</p>
          <h1>Movimientos</h1>
        </div>
        <button
          aria-expanded={isCategoryManagerOpen}
          onClick={() => setIsCategoryManagerOpen((open) => !open)}
          type="button"
        >
          {isCategoryManagerOpen ? 'Ocultar categorías' : 'Gestionar categorías'}
        </button>
      </header>

      {isCategoryManagerOpen ? (
        <CategoryManager
          categories={categories}
          onCategoriesChanged={refreshCategories}
          onClose={() => setIsCategoryManagerOpen(false)}
        />
      ) : null}

      {loadFailed ? (
        <FeedbackMessage tone="error">
          No se pudieron cargar tus movimientos. Comprueba la conexión e inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}
      {actionError ? (
        <FeedbackMessage tone="error">
          No se pudo completar la operación. Verifica el importe pendiente e inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}

      <ConflictResolver
        categories={categories}
        conflicts={conflicts}
        financialAccounts={financialAccounts}
        onResolve={(conflict, revision) => void handleResolveConflict(conflict, revision)}
      />

      <PeriodSummary
        categories={categories}
        movements={movements}
        onPeriodChange={setPeriod}
        period={period}
        refunds={refunds}
      />

      <div className="movement-page__content">
        <MovementForm
          categories={categories}
          financialAccounts={financialAccounts}
          key={editingMovement?.id ?? 'new-movement'}
          movement={editingMovement}
          onCancel={() => setEditingMovement(null)}
          onSave={handleSave}
        />

        <MovementHistory
          categories={categories}
          financialAccounts={financialAccounts}
          isLoading={isLoading}
          movements={movements}
          onDeleteMovement={handleDelete}
          onDeleteRefund={handleDeleteRefund}
          onEditMovement={setEditingMovement}
          onRecordsChanged={refreshPeriodRecords}
          period={period}
          refunds={refunds}
        />
      </div>
    </main>
  );
}

function applySyncResults(current: Movement[], results: SyncOutcome[]): Movement[] {
  const movementsById = new Map(current.map((movement) => [movement.id, movement]));

  for (const result of results) {
    if (!result.movement) {
      movementsById.delete(result.movementId);
      continue;
    }

    movementsById.set(result.movement.id, result.movement);
  }

  return [...movementsById.values()].sort(sortByDate);
}

function sortByDate(left: Movement, right: Movement): number {
  return (
    right.occurred_on.localeCompare(left.occurred_on) ||
    right.created_at.localeCompare(left.created_at)
  );
}
