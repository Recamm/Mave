import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, X } from 'lucide-react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { useAuthSession } from '../../app/useAuthSession';
import { AccountBalanceOverview } from '../accounts/AccountBalanceOverview';
import { getPrimaryAccountId, savePrimaryAccountId } from '../accounts/primaryAccountPreference';
import { accountService, type FinancialAccount } from '../accounts/accountService';
import { transferService, type Transfer } from '../accounts/transferService';
import { categoryService, type Category } from '../categories/categoryService';
import { MovementForm } from './MovementForm';
import { createMovementDefaults, type MovementInput } from './movementInput';
import { movementService, type FinancialAccountOption, type Movement } from './movementService';
import { MovementHistory } from '../summaries/MovementHistory';
import { getCurrentPeriod } from '../summaries/periodSummary';
import { summaryService } from '../summaries/summaryService';
import { refundService, type Refund } from './refundService';
import { RecurringMovementsPanel } from './RecurringMovementsPanel';
import { recurringMovementService, type RecurringMovement } from './recurringMovementService';
import { getOccurrenceDate, type RecurrenceSettings } from './recurrence';
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
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [conflicts, setConflicts] = useState<MovementConflict[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [recurringMovements, setRecurringMovements] = useState<RecurringMovement[]>([]);
  const [period] = useState(() => getCurrentPeriod());
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [isMovementFormOpen, setIsMovementFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccountOverviewLoading, setIsAccountOverviewLoading] = useState(true);
  const [hasAccountOverviewError, setHasAccountOverviewError] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [recurringLoadFailed, setRecurringLoadFailed] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [expiredPendingPurged, setExpiredPendingPurged] = useState(false);
  const movementDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = movementDialogRef.current;
    if (isMovementFormOpen && dialog && !dialog.open) {
      dialog.showModal();
    }
  }, [isMovementFormOpen]);

  useEffect(() => {
    let isCurrent = true;
    setIsLoading(true);
    setIsAccountOverviewLoading(true);
    setHasAccountOverviewError(false);
    setConflicts([]);
    setExpiredPendingPurged(false);
    setRecurringMovements([]);
    setRecurringLoadFailed(false);
    setAccounts([]);
    setTransfers([]);

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
      const recurringPromise = ownerId
        ? recurringMovementService.list()
        : Promise.resolve<RecurringMovement[]>([]);
      const accountOverviewPromise = Promise.all([
        accountService.listAccounts(),
        transferService.listTransfers(),
      ]);
      const [readResult, syncResult, accountOverviewResult, recurringResult] =
        await Promise.allSettled([
          readsPromise,
          syncPromise,
          accountOverviewPromise,
          recurringPromise,
        ]);

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

      if (accountOverviewResult.status === 'fulfilled') {
        const [loadedAccounts, loadedTransfers] = accountOverviewResult.value;
        setAccounts(loadedAccounts);
        setTransfers(loadedTransfers);
        setSelectedAccountId(ownerId ? getPrimaryAccountId(ownerId, loadedAccounts) : '');
      } else {
        setHasAccountOverviewError(true);
      }
      setIsAccountOverviewLoading(false);

      if (recurringResult.status === 'fulfilled') {
        setRecurringMovements(recurringResult.value);
        setRecurringLoadFailed(false);
      } else {
        setRecurringLoadFailed(true);
      }

      if (syncResult.status === 'fulfilled') {
        const discardedPendingCount = syncResult.value.reduce(
          (count, result) => count + (result.discardedPendingCount ?? 0),
          0,
        );
        if (discardedPendingCount > 0) {
          setExpiredPendingPurged(true);
          visibleMovements = visibleMovements.filter(
            (movement) => movement.syncStatus === 'synced',
          );
        }
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
        const discardedPendingCount = results.reduce(
          (count, result) => count + (result.discardedPendingCount ?? 0),
          0,
        );
        const [periodRecords, openConflicts, loadedRecurringMovements] = await Promise.all([
          summaryService.listPeriodRecords(),
          syncEngine.listOpenConflicts(syncOwnerId),
          recurringMovementService.list().catch(() => null),
        ]);
        const visibleMovements = await syncEngine.listVisibleMovements(
          syncOwnerId,
          periodRecords.movements,
        );

        if (!isCurrent) {
          return;
        }

        if (discardedPendingCount > 0) {
          setExpiredPendingPurged(true);
        }
        const visibleSyncedMovements =
          discardedPendingCount > 0
            ? visibleMovements.filter((movement) => movement.syncStatus === 'synced')
            : visibleMovements;
        setMovements(applySyncResults(visibleSyncedMovements, results));
        setRefunds(periodRecords.refunds);
        setConflicts(openConflicts);
        if (loadedRecurringMovements) {
          setRecurringMovements(loadedRecurringMovements);
          setRecurringLoadFailed(false);
        }
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

  async function handleSave(input: MovementInput, recurrence?: RecurrenceSettings) {
    if (!ownerId) {
      throw new Error('Authenticated owner is unavailable.');
    }

    if (recurrence) {
      const createdRecurringMovement = await recurringMovementService.create({
        ...input,
        ...recurrence,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      setRecurringMovements((current) =>
        [...current, createdRecurringMovement].sort((left, right) =>
          left.nextDueOn.localeCompare(right.nextDueOn),
        ),
      );
      setEditingMovement(null);
      setIsMovementFormOpen(false);
      setActionError(false);
      return;
    }

    const result = await syncEngine.submitMovementChange({
      action: editingMovement ? 'update' : 'create',
      expectedVersion: editingMovement?.version ?? null,
      movementId: editingMovement?.id,
      ownerId,
      payload: input,
    });
    if ((result.discardedPendingCount ?? 0) > 0) {
      setExpiredPendingPurged(true);
    }

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
    setIsMovementFormOpen(false);
    setActionError(false);
  }

  async function handleMarkRecurringMovementPaid(recurringMovement: RecurringMovement) {
    if (!ownerId) {
      throw new Error('Authenticated owner is unavailable.');
    }

    const paidMovement = await recurringMovementService.markPaid(
      recurringMovement.id,
      recurringMovement.occurrence_index,
      createMovementDefaults().occurredOn,
      crypto.randomUUID(),
    );
    setMovements((current) =>
      [paidMovement, ...current.filter((movement) => movement.id !== paidMovement.id)].sort(
        sortByDate,
      ),
    );
    setRecurringMovements((current) =>
      current.map((item) => {
        if (item.id !== recurringMovement.id) {
          return item;
        }

        const nextOccurrenceIndex = item.occurrence_index + 1;
        return {
          ...item,
          last_notified_on: null,
          nextDueOn: getOccurrenceDate(
            item.starts_on,
            nextOccurrenceIndex,
            item.interval_count,
            item.interval_unit,
          ),
          occurrence_index: nextOccurrenceIndex,
        };
      }),
    );
    void recurringMovementService
      .list()
      .then(setRecurringMovements)
      .catch(() => undefined);
  }

  async function handleSetRecurringActive(id: string, active: boolean) {
    const updated = await recurringMovementService.setActive(id, active);
    setRecurringMovements((current) => current.map((item) => (item.id === id ? updated : item)));
  }

  async function handleSetRecurringReminder(id: string, reminderEnabled: boolean) {
    const updated = await recurringMovementService.setReminderEnabled(id, reminderEnabled);
    setRecurringMovements((current) => current.map((item) => (item.id === id ? updated : item)));
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
      if ((result.discardedPendingCount ?? 0) > 0) {
        setExpiredPendingPurged(true);
      }
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
      if ((result.discardedPendingCount ?? 0) > 0) {
        setExpiredPendingPurged(true);
      }
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

  function handleEditMovement(movement: Movement) {
    setEditingMovement(movement);
    setIsMovementFormOpen(true);
  }

  function closeMovementForm() {
    setEditingMovement(null);
    setIsMovementFormOpen(false);
  }

  function handleAccountChange(accountId: string) {
    setSelectedAccountId(accountId);
    if (ownerId) {
      savePrimaryAccountId(ownerId, accountId);
    }
  }

  const movementsForAccount = selectedAccountId
    ? movements.filter((movement) => movement.financial_account_id === selectedAccountId)
    : movements.filter((movement) => movement.financial_account_id === null);
  const movementIdsForAccount = new Set(movementsForAccount.map((movement) => movement.id));
  const refundsForAccount = refunds.filter((refund) =>
    movementIdsForAccount.has(refund.expense_id),
  );
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;

  return (
    <main className="movement-page dashboard-page">
      <h1 className="visually-hidden">Inicio</h1>

      <div className="dashboard-overview">
        {selectedAccount && !isAccountOverviewLoading && !hasAccountOverviewError ? (
          <div className="dashboard-overview__account">
            <label className="dashboard-account-selector">
              <span className="visually-hidden">Cuenta principal</span>
              <select
                aria-label="Cuenta principal"
                onChange={(event) => handleAccountChange(event.target.value)}
                value={selectedAccount.id}
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" size={17} strokeWidth={2.5} />
            </label>
          </div>
        ) : null}

        <div className="dashboard-overview__body">
          <AccountBalanceOverview
            accounts={accounts}
            period={period}
            selectedAccountId={selectedAccountId}
            hasLoadError={hasAccountOverviewError}
            isLoading={isAccountOverviewLoading}
            movements={movements}
            refunds={refunds}
            transfers={transfers}
          />

          <div className="dashboard-actions__list">
            <button
              aria-haspopup="dialog"
              className="button-primary dashboard-action"
              onClick={() => setIsMovementFormOpen(true)}
              type="button"
            >
              Nuevo movimiento
            </button>
            <Link className="dashboard-action" to="/accounts">
              Transferir
            </Link>
          </div>
        </div>
      </div>

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
      {expiredPendingPurged ? (
        <FeedbackMessage tone="info">
          Los movimientos pendientes se eliminaron de este dispositivo al vencer la solicitud.
        </FeedbackMessage>
      ) : null}

      <ConflictResolver
        categories={categories}
        conflicts={conflicts}
        financialAccounts={financialAccounts}
        onResolve={(conflict, revision) => void handleResolveConflict(conflict, revision)}
      />

      <RecurringMovementsPanel
        categories={categories}
        loadFailed={recurringLoadFailed}
        movements={recurringMovements}
        onMarkPaid={handleMarkRecurringMovementPaid}
        onSetActive={handleSetRecurringActive}
        onSetReminderEnabled={handleSetRecurringReminder}
      />

      {isMovementFormOpen ? (
        <dialog
          aria-labelledby="movement-form-title"
          className="movement-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeMovementForm();
          }}
          ref={movementDialogRef}
        >
          <button
            aria-label="Cerrar formulario"
            autoFocus
            className="movement-dialog__close"
            onClick={closeMovementForm}
            title="Cerrar formulario"
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
          <MovementForm
            categories={categories}
            defaultAccount={selectedAccount}
            financialAccounts={financialAccounts}
            key={editingMovement?.id ?? `new-movement:${selectedAccountId}`}
            movement={editingMovement}
            onCancel={closeMovementForm}
            onSave={handleSave}
          />
        </dialog>
      ) : null}

      <MovementHistory
        categories={categories}
        financialAccounts={financialAccounts}
        isLoading={isLoading}
        movements={movementsForAccount}
        onDeleteMovement={handleDelete}
        onDeleteRefund={handleDeleteRefund}
        onEditMovement={handleEditMovement}
        onRecordsChanged={refreshPeriodRecords}
        refunds={refundsForAccount}
      />
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
