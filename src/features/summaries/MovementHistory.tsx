import { useState } from 'react';
import type { Category } from '../categories/categoryService';
import { RefundForm } from '../movements/RefundForm';
import type { FinancialAccountOption, Movement } from '../movements/movementService';
import type { Refund } from '../movements/refundService';
import { formatCivilDate, formatMoney } from '../../lib/money/format';
import { getSummaryPeriod } from './periodSummary';

type MovementHistoryProps = {
  period: string;
  movements: Movement[];
  refunds: Refund[];
  categories: Category[];
  financialAccounts: FinancialAccountOption[];
  isLoading: boolean;
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (movement: Movement) => void | Promise<void>;
  onDeleteRefund: (refund: Refund) => void | Promise<void>;
  onRecordsChanged: () => Promise<void>;
};

type PeriodHistoryEntry =
  | {
      type: 'movement';
      id: string;
      sortDate: string;
      movement: Movement;
      refunds: Refund[];
    }
  | {
      type: 'refunds';
      id: string;
      sortDate: string;
      expense: Movement;
      refunds: Refund[];
    };

type RefundManagerProps = {
  expense: Movement;
  refunds: Refund[];
  categoryName: string;
  financialAccounts: FinancialAccountOption[];
  onDeleteRefund: (refund: Refund) => void | Promise<void>;
  onRecordsChanged: () => Promise<void>;
};

export function MovementHistory({
  period,
  movements,
  refunds,
  categories,
  financialAccounts,
  isLoading,
  onEditMovement,
  onDeleteMovement,
  onDeleteRefund,
  onRecordsChanged,
}: MovementHistoryProps) {
  const dateRange = getSummaryPeriod(period);
  const movementsInPeriod = movements.filter(
    (movement) => movement.occurred_on >= dateRange.start && movement.occurred_on <= dateRange.end,
  );
  const refundsInPeriod = refunds.filter(
    (refund) => refund.received_on >= dateRange.start && refund.received_on <= dateRange.end,
  );
  const movementsById = new Map(movements.map((movement) => [movement.id, movement]));
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const refundsByExpense = new Map<string, Refund[]>();

  for (const refund of refundsInPeriod) {
    const expenseRefunds = refundsByExpense.get(refund.expense_id) ?? [];
    expenseRefunds.push(refund);
    refundsByExpense.set(refund.expense_id, expenseRefunds);
  }

  const movementIdsInPeriod = new Set(movementsInPeriod.map((movement) => movement.id));
  const historyEntries: PeriodHistoryEntry[] = movementsInPeriod.map((movement) => {
    const movementRefunds = refundsByExpense.get(movement.id) ?? [];

    return {
      type: 'movement',
      id: movement.id,
      sortDate: latestDate(
        movement.occurred_on,
        movementRefunds.map((refund) => refund.received_on),
      ),
      movement,
      refunds: movementRefunds,
    };
  });

  for (const [expenseId, expenseRefunds] of refundsByExpense) {
    if (movementIdsInPeriod.has(expenseId)) {
      continue;
    }

    const expense = movementsById.get(expenseId);
    if (!expense || expense.kind !== 'expense') {
      continue;
    }

    historyEntries.push({
      type: 'refunds',
      id: expense.id,
      sortDate: latestDate(
        '',
        expenseRefunds.map((refund) => refund.received_on),
      ),
      expense,
      refunds: expenseRefunds,
    });
  }

  historyEntries.sort(
    (left, right) => right.sortDate.localeCompare(left.sortDate) || left.id.localeCompare(right.id),
  );

  return (
    <section aria-labelledby="movement-history-title" className="movement-history">
      <div className="movement-history__heading">
        <h2 id="movement-history-title">Historial</h2>
        <span>{isLoading ? 'Cargando…' : historyEntries.length}</span>
      </div>
      {historyEntries.length > 0 ? (
        <ol aria-label="Historial de movimientos" className="movement-history__list">
          {historyEntries.map((entry) =>
            entry.type === 'movement' ? (
              <li className="movement-row" key={`movement:${entry.id}`}>
                <div className="movement-row__details">
                  <span
                    aria-label={entry.movement.kind === 'income' ? 'Ingreso' : 'Gasto'}
                    className={`movement-row__kind movement-row__kind--${entry.movement.kind}`}
                  >
                    {entry.movement.kind === 'income' ? 'Ingreso' : 'Gasto'}
                  </span>
                  <strong>{categoryNames.get(entry.movement.category_id) ?? 'Categoría'}</strong>
                  <time dateTime={entry.movement.occurred_on}>
                    {formatCivilDate(entry.movement.occurred_on)}
                  </time>
                  {entry.movement.note ? <span>{entry.movement.note}</span> : null}
                  <span aria-label="Estado de sincronización" className="movement-row__sync-status">
                    {syncStatusLabel(entry.movement.syncStatus ?? 'synced')}
                  </span>
                </div>
                <div className="movement-row__actions">
                  <strong className="movement-row__amount">
                    {formatMoney(entry.movement.amount, entry.movement.currency)}
                  </strong>
                  <button
                    aria-label="Editar movimiento"
                    onClick={() => onEditMovement(entry.movement)}
                    type="button"
                  >
                    Editar
                  </button>
                  <button
                    aria-label="Eliminar movimiento"
                    onClick={() => void onDeleteMovement(entry.movement)}
                    type="button"
                  >
                    Eliminar
                  </button>
                </div>
                {entry.movement.kind === 'expense' ? (
                  <RefundManager
                    categoryName={categoryNames.get(entry.movement.category_id) ?? 'Categoría'}
                    expense={entry.movement}
                    financialAccounts={financialAccounts}
                    onDeleteRefund={onDeleteRefund}
                    onRecordsChanged={onRecordsChanged}
                    refunds={entry.refunds}
                  />
                ) : null}
              </li>
            ) : (
              <li className="movement-row movement-row--refund" key={`refund:${entry.id}`}>
                <div className="movement-row__details">
                  <span className="movement-row__kind movement-row__kind--refund">Devolución</span>
                  <strong>{categoryNames.get(entry.expense.category_id) ?? 'Categoría'}</strong>
                  <span>Gasto original {formatCivilDate(entry.expense.occurred_on)}</span>
                </div>
                <RefundManager
                  categoryName={categoryNames.get(entry.expense.category_id) ?? 'Categoría'}
                  expense={entry.expense}
                  financialAccounts={financialAccounts}
                  onDeleteRefund={onDeleteRefund}
                  onRecordsChanged={onRecordsChanged}
                  refunds={entry.refunds}
                />
              </li>
            ),
          )}
        </ol>
      ) : (
        <p className="movement-history__empty">
          {isLoading ? ' ' : 'No hay movimientos en este período.'}
        </p>
      )}
    </section>
  );
}

function syncStatusLabel(status: NonNullable<Movement['syncStatus']>): string {
  switch (status) {
    case 'pending':
      return 'Solo en este dispositivo';
    case 'sending':
      return 'Sincronizando';
    case 'retry':
      return 'Reintento pendiente';
    case 'conflict':
      return 'Requiere atención';
    case 'blocked':
      return 'Sincronización bloqueada';
    case 'synced':
      return 'Sincronizado';
  }
}

function RefundManager({
  expense,
  refunds,
  categoryName,
  financialAccounts,
  onDeleteRefund,
  onRecordsChanged,
}: RefundManagerProps) {
  const [editingRefund, setEditingRefund] = useState<Refund | null | undefined>(undefined);
  const accountName =
    financialAccounts.find((account) => account.id === expense.financial_account_id)?.name ?? null;

  async function handleSaved() {
    await onRecordsChanged();
    setEditingRefund(undefined);
  }

  return (
    <div className="movement-row__refunds">
      {refunds.map((refund) => (
        <div className="movement-refund" key={refund.id}>
          <div className="movement-refund__details">
            <strong>{formatMoney(refund.amount, expense.currency)}</strong>
            <time dateTime={refund.received_on}>{formatCivilDate(refund.received_on)}</time>
          </div>
          <div className="movement-refund__actions">
            <button
              aria-label="Editar devolución"
              onClick={() => setEditingRefund(refund)}
              type="button"
            >
              Editar devolución
            </button>
            <button
              aria-label="Eliminar devolución"
              onClick={() => void onDeleteRefund(refund)}
              type="button"
            >
              Eliminar devolución
            </button>
          </div>
        </div>
      ))}
      {editingRefund === undefined ? (
        <button onClick={() => setEditingRefund(null)} type="button">
          Registrar devolución
        </button>
      ) : null}
      {editingRefund !== undefined ? (
        <RefundForm
          accountName={accountName}
          categoryName={categoryName}
          expense={expense}
          onCancel={() => setEditingRefund(undefined)}
          onSaved={handleSaved}
          refund={editingRefund}
        />
      ) : null}
    </div>
  );
}

function latestDate(currentDate: string, candidateDates: string[]): string {
  return candidateDates.reduce(
    (latest, candidate) => (candidate > latest ? candidate : latest),
    currentDate,
  );
}
