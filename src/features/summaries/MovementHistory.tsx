import Big from 'big.js';
import { ChevronDown } from 'lucide-react';
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

type HistoryView = 'general' | 'categories';
type HistoryKindFilter = 'all' | 'expense' | 'income';

type CategoryHistoryGroup = {
  categoryId: string;
  currency: Movement['currency'];
  kind: Movement['kind'];
  total: Big;
  entries: PeriodHistoryEntry[];
};

type HistoryEntryProps = {
  entry: PeriodHistoryEntry;
  categoryNames: Map<string, string>;
  financialAccounts: FinancialAccountOption[];
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (movement: Movement) => void | Promise<void>;
  onDeleteRefund: (refund: Refund) => void | Promise<void>;
  onRecordsChanged: () => Promise<void>;
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
  const [view, setView] = useState<HistoryView>('general');
  const [kindFilter, setKindFilter] = useState<HistoryKindFilter>('all');
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(() => new Set());
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

  const filteredEntries = historyEntries.filter((entry) => {
    const kind = entry.type === 'movement' ? entry.movement.kind : 'expense';
    return kindFilter === 'all' || kindFilter === kind;
  });
  const categoryGroupsById = new Map<string, CategoryHistoryGroup>();

  for (const entry of filteredEntries) {
    const movement = entry.type === 'movement' ? entry.movement : entry.expense;
    const kind = movement.kind;
    const key = `${movement.category_id}:${movement.currency}:${kind}`;
    const group = categoryGroupsById.get(key) ?? {
      categoryId: movement.category_id,
      currency: movement.currency,
      kind,
      total: new Big(0),
      entries: [],
    };
    const refundsTotal = sumRefunds(entry.refunds);
    const entryAmount =
      entry.type === 'refunds'
        ? refundsTotal.times(-1)
        : kind === 'expense'
          ? new Big(movement.amount).minus(refundsTotal)
          : new Big(movement.amount);

    group.total = group.total.plus(entryAmount);
    group.entries.push(entry);
    categoryGroupsById.set(key, group);
  }

  const categoryGroups = [...categoryGroupsById.values()].sort((left, right) =>
    (categoryNames.get(left.categoryId) ?? 'Categoría').localeCompare(
      categoryNames.get(right.categoryId) ?? 'Categoría',
    ),
  );

  function toggleCategoryGroup(key: string) {
    setExpandedCategoryKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <section aria-labelledby="movement-history-title" className="movement-history">
      <div className="movement-history__heading">
        <h2 id="movement-history-title">Historial</h2>
        <span>{isLoading ? 'Cargando…' : filteredEntries.length}</span>
      </div>
      <div className="movement-history__controls">
        <div aria-label="Vista del historial" className="movement-history__views" role="group">
          <button
            aria-pressed={view === 'general'}
            onClick={() => setView('general')}
            type="button"
          >
            General
          </button>
          <button
            aria-pressed={view === 'categories'}
            onClick={() => setView('categories')}
            type="button"
          >
            Por categoría
          </button>
        </div>
        <label className="visually-hidden" htmlFor="history-kind-filter">
          Tipo de movimiento
        </label>
        <select
          id="history-kind-filter"
          onChange={(event) => setKindFilter(event.target.value as HistoryKindFilter)}
          value={kindFilter}
        >
          <option value="all">Todos</option>
          <option value="expense">Gastos</option>
          <option value="income">Ingresos</option>
        </select>
      </div>

      {filteredEntries.length > 0 ? (
        view === 'general' ? (
          <ol aria-label="Historial de movimientos" className="movement-history__list">
            {filteredEntries.map((entry) => (
              <HistoryEntry
                categoryNames={categoryNames}
                entry={entry}
                financialAccounts={financialAccounts}
                key={`${entry.type}:${entry.id}`}
                onDeleteMovement={onDeleteMovement}
                onDeleteRefund={onDeleteRefund}
                onEditMovement={onEditMovement}
                onRecordsChanged={onRecordsChanged}
              />
            ))}
          </ol>
        ) : (
          <ol aria-label="Movimientos por categoría" className="movement-categories__list">
            {categoryGroups.map((group) => {
              const groupKey = `${group.categoryId}:${group.currency}:${group.kind}`;
              const entriesId = `movement-category-${group.categoryId}-${group.currency}-${group.kind}`;
              const isExpanded = expandedCategoryKeys.has(groupKey);

              return (
                <li className="movement-category" key={groupKey}>
                  <button
                    aria-controls={entriesId}
                    aria-expanded={isExpanded}
                    className="movement-category__summary"
                    onClick={() => toggleCategoryGroup(groupKey)}
                    type="button"
                  >
                    <span className={`movement-row__kind movement-row__kind--${group.kind}`}>
                      {group.kind === 'income' ? 'Ingreso' : 'Gasto'}
                    </span>
                    <strong>{categoryNames.get(group.categoryId) ?? 'Categoría'}</strong>
                    <output>{formatMoney(group.total.toFixed(2), group.currency)}</output>
                    <ChevronDown
                      aria-hidden="true"
                      className="movement-category__chevron"
                      size={18}
                    />
                  </button>
                  <ol className="movement-category__entries" hidden={!isExpanded} id={entriesId}>
                    {group.entries.map((entry) => (
                      <HistoryEntry
                        categoryNames={categoryNames}
                        entry={entry}
                        financialAccounts={financialAccounts}
                        key={`${entry.type}:${entry.id}`}
                        onDeleteMovement={onDeleteMovement}
                        onDeleteRefund={onDeleteRefund}
                        onEditMovement={onEditMovement}
                        onRecordsChanged={onRecordsChanged}
                      />
                    ))}
                  </ol>
                </li>
              );
            })}
          </ol>
        )
      ) : (
        <p className="movement-history__empty">
          {isLoading ? ' ' : 'No hay movimientos en este período.'}
        </p>
      )}
    </section>
  );
}

function HistoryEntry({
  entry,
  categoryNames,
  financialAccounts,
  onEditMovement,
  onDeleteMovement,
  onDeleteRefund,
  onRecordsChanged,
}: HistoryEntryProps) {
  if (entry.type === 'refunds') {
    const categoryName = categoryNames.get(entry.expense.category_id) ?? 'Categoría';
    const refundTotal = sumRefunds(entry.refunds).toFixed(2);

    return (
      <li className="movement-row movement-row--refund">
        <details className="movement-entry">
          <summary className="movement-entry__summary">
            <span className="movement-row__kind movement-row__kind--refund">Devolución</span>
            <span className="movement-entry__summary-main">
              <strong>{categoryName}</strong>
              <time dateTime={entry.sortDate}>{formatCivilDate(entry.sortDate)}</time>
            </span>
            <strong className="movement-row__amount">
              {formatMoney(refundTotal, entry.expense.currency)}
            </strong>
          </summary>
          <div className="movement-entry__expanded">
            <p>Gasto original {formatCivilDate(entry.expense.occurred_on)}</p>
            <RefundManager
              categoryName={categoryName}
              expense={entry.expense}
              financialAccounts={financialAccounts}
              onDeleteRefund={onDeleteRefund}
              onRecordsChanged={onRecordsChanged}
              refunds={entry.refunds}
            />
          </div>
        </details>
      </li>
    );
  }

  const categoryName = categoryNames.get(entry.movement.category_id) ?? 'Categoría';
  const kindLabel = entry.movement.kind === 'income' ? 'Ingreso' : 'Gasto';

  return (
    <li className="movement-row">
      <details className="movement-entry">
        <summary className="movement-entry__summary">
          <span
            aria-label={kindLabel}
            className={`movement-row__kind movement-row__kind--${entry.movement.kind}`}
          >
            {kindLabel}
          </span>
          <span className="movement-entry__summary-main">
            <strong>{categoryName}</strong>
            <time dateTime={entry.movement.occurred_on}>
              {formatCivilDate(entry.movement.occurred_on)}
            </time>
          </span>
          <strong className="movement-row__amount">
            {formatMoney(entry.movement.amount, entry.movement.currency)}
          </strong>
        </summary>
        <div className="movement-entry__expanded">
          {entry.movement.note ? <p>{entry.movement.note}</p> : null}
          <span aria-label="Estado de sincronización" className="movement-row__sync-status">
            {syncStatusLabel(entry.movement.syncStatus ?? 'synced')}
          </span>
          <div className="movement-row__actions">
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
              categoryName={categoryName}
              expense={entry.movement}
              financialAccounts={financialAccounts}
              onDeleteRefund={onDeleteRefund}
              onRecordsChanged={onRecordsChanged}
              refunds={entry.refunds}
            />
          ) : null}
        </div>
      </details>
    </li>
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

function sumRefunds(refunds: Refund[]): Big {
  return refunds.reduce((total, refund) => total.plus(refund.amount), new Big(0));
}
