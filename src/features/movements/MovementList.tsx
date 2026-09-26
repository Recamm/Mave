import { useEffect, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
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

export function MovementList() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [financialAccounts, setFinancialAccounts] = useState<FinancialAccountOption[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [period, setPeriod] = useState(() => getCurrentPeriod());
  const [editingMovement, setEditingMovement] = useState<Movement | null>(null);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [actionError, setActionError] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadPage() {
      try {
        const [loadedCategories, periodRecords, loadedAccounts] = await Promise.all([
          categoryService.listCategories(),
          summaryService.listPeriodRecords(),
          movementService.listFinancialAccounts(),
        ]);

        if (isCurrent) {
          setCategories(loadedCategories);
          setMovements(periodRecords.movements);
          setRefunds(periodRecords.refunds);
          setFinancialAccounts(loadedAccounts);
          setLoadFailed(false);
        }
      } catch {
        if (isCurrent) {
          setLoadFailed(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadPage();
    return () => {
      isCurrent = false;
    };
  }, []);

  async function refreshCategories() {
    setCategories(await categoryService.listCategories());
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
    const savedMovement = editingMovement
      ? await movementService.updateMovement(editingMovement.id, input)
      : await movementService.createMovement(input);

    setMovements((current) => {
      const withoutSavedMovement = current.filter((movement) => movement.id !== savedMovement.id);
      return [savedMovement, ...withoutSavedMovement].sort(sortByDate);
    });
    setEditingMovement(null);
    setActionError(false);
  }

  async function handleDelete(movement: Movement) {
    if (!window.confirm('¿Eliminar este movimiento?')) {
      return;
    }

    try {
      await movementService.deleteMovement(movement.id);
      setMovements((current) => current.filter((item) => item.id !== movement.id));
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

function sortByDate(left: Movement, right: Movement): number {
  return (
    right.occurred_on.localeCompare(left.occurred_on) ||
    right.created_at.localeCompare(left.created_at)
  );
}
