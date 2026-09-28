import Big from 'big.js';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  getMovementTypeDisplayPreference,
  getMovementTypeLabel,
  type MovementKindDisplay,
  type MovementTypeDisplayPreference,
} from '../../app/movementTypeDisplay';
import type { Category } from '../categories/categoryService';
import { FullPageFormDialog } from '../../app/components/FullPageFormDialog';
import { RefundForm } from '../movements/RefundForm';
import type { FinancialAccountOption, Movement } from '../movements/movementService';
import type { RecurringMovementPayment } from '../movements/recurringMovementService';
import type { Refund } from '../movements/refundService';
import { formatCivilDate, formatMoney } from '../../lib/money/format';
import { getCurrentPeriod, getSummaryPeriod, type SummaryPeriod } from './periodSummary';

type MovementHistoryProps = {
  movements: Movement[];
  refunds: Refund[];
  categories: Category[];
  financialAccounts: FinancialAccountOption[];
  isLoading: boolean;
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (movement: Movement) => void | Promise<void>;
  onDeleteRefund: (refund: Refund) => void | Promise<void>;
  onRecordsChanged: () => Promise<void>;
  onUndoRecurringPayment: (movement: Movement) => void | Promise<void>;
  recurringPayments: RecurringMovementPayment[];
};

type HistoryEntryData =
  | {
      type: 'movement';
      id: string;
      sortDate: string;
      movement: Movement;
      recurringPayment: RecurringMovementPayment | null;
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
type CategoryPeriodMode = 'month' | 'week';

type CategoryHistoryGroup = {
  categoryId: string;
  currency: Movement['currency'];
  kind: Movement['kind'];
  total: Big;
  entries: HistoryEntryData[];
};

type HistoryEntryProps = {
  entry: HistoryEntryData;
  showDate?: boolean;
  movementTypeDisplayPreference: MovementTypeDisplayPreference;
  categoryNames: Map<string, string>;
  financialAccounts: FinancialAccountOption[];
  onEditMovement: (movement: Movement) => void;
  onDeleteMovement: (movement: Movement) => void | Promise<void>;
  onDeleteRefund: (refund: Refund) => void | Promise<void>;
  onRecordsChanged: () => Promise<void>;
  onUndoRecurringPayment: (movement: Movement) => void | Promise<void>;
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
  movements,
  refunds,
  categories,
  financialAccounts,
  isLoading,
  onEditMovement,
  onDeleteMovement,
  onDeleteRefund,
  onRecordsChanged,
  onUndoRecurringPayment,
  recurringPayments,
}: MovementHistoryProps) {
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<HistoryView>('categories');
  const [kindFilter, setKindFilter] = useState<HistoryKindFilter>('all');
  const [categoryPeriodMode, setCategoryPeriodMode] = useState<CategoryPeriodMode>('month');
  const [categoryMonth, setCategoryMonth] = useState(getCurrentPeriod);
  const [categoryWeek, setCategoryWeek] = useState(getCurrentIsoWeek);
  const [movementTypeDisplayPreference] = useState(() => getMovementTypeDisplayPreference());
  const [expandedCategoryKeys, setExpandedCategoryKeys] = useState<Set<string>>(() => new Set());
  const movementsById = new Map(movements.map((movement) => [movement.id, movement]));
  const recurringPaymentsByMovementId = new Map(
    recurringPayments.map((payment) => [payment.movement_id, payment]),
  );
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const refundsByExpense = new Map<string, Refund[]>();

  for (const refund of refunds) {
    const expenseRefunds = refundsByExpense.get(refund.expense_id) ?? [];
    expenseRefunds.push(refund);
    refundsByExpense.set(refund.expense_id, expenseRefunds);
  }

  const movementIds = new Set(movements.map((movement) => movement.id));
  const historyEntries: HistoryEntryData[] = movements.map((movement) => {
    const movementRefunds = refundsByExpense.get(movement.id) ?? [];

    return {
      type: 'movement',
      id: movement.id,
      sortDate: latestDate(
        movement.occurred_on,
        movementRefunds.map((refund) => refund.received_on),
      ),
      movement,
      recurringPayment: recurringPaymentsByMovementId.get(movement.id) ?? null,
      refunds: movementRefunds,
    };
  });

  for (const [expenseId, expenseRefunds] of refundsByExpense) {
    if (movementIds.has(expenseId)) {
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

  const dialogEntries = historyEntries.filter((entry) => {
    const kind = entry.type === 'movement' ? entry.movement.kind : 'expense';
    return kindFilter === 'all' || kindFilter === kind;
  });
  const categoryPeriod =
    categoryPeriodMode === 'month'
      ? getSummaryPeriod(categoryMonth)
      : getIsoWeekPeriod(categoryWeek);
  const categoryEntries = getCategoryHistoryEntries(historyEntries, categoryPeriod);
  const entriesByDay = new Map<string, HistoryEntryData[]>();
  for (const entry of dialogEntries) {
    const date = entry.type === 'movement' ? entry.movement.occurred_on : entry.sortDate;
    const dayEntries = entriesByDay.get(date) ?? [];
    dayEntries.push(entry);
    entriesByDay.set(date, dayEntries);
  }
  const historyDays = [...entriesByDay.entries()]
    .map(([date, entries]) => ({ date, entries }))
    .sort((left, right) => right.date.localeCompare(left.date));
  const categoryGroupsById = new Map<string, CategoryHistoryGroup>();

  for (const entry of categoryEntries) {
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
  const hasPreviewEntries =
    view === 'general' ? historyEntries.length > 0 : categoryEntries.length > 0;

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
        <span>{isLoading ? 'Cargando…' : historyEntries.length}</span>
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
        {view === 'categories' ? (
          <div className="movement-history__category-period">
            <div
              aria-label="Período de categorías"
              className="movement-history__period-views"
              role="group"
            >
              <button
                aria-pressed={categoryPeriodMode === 'week'}
                onClick={() => setCategoryPeriodMode('week')}
                type="button"
              >
                Semana
              </button>
              <button
                aria-pressed={categoryPeriodMode === 'month'}
                onClick={() => setCategoryPeriodMode('month')}
                type="button"
              >
                Mes
              </button>
            </div>
            <label className="visually-hidden" htmlFor={`history-${categoryPeriodMode}-filter`}>
              {categoryPeriodMode === 'month' ? 'Mes de categorías' : 'Semana de categorías'}
            </label>
            <input
              id={`history-${categoryPeriodMode}-filter`}
              onChange={(event) => {
                if (!event.currentTarget.value) {
                  return;
                }

                if (categoryPeriodMode === 'month') {
                  setCategoryMonth(event.currentTarget.value);
                } else {
                  setCategoryWeek(event.currentTarget.value);
                }
              }}
              type={categoryPeriodMode}
              value={categoryPeriodMode === 'month' ? categoryMonth : categoryWeek}
            />
          </div>
        ) : null}
      </div>

      {hasPreviewEntries ? (
        view === 'general' ? (
          <ol aria-label="Historial de movimientos" className="movement-history__list">
            {historyEntries.slice(0, 5).map((entry) => (
              <HistoryEntry
                categoryNames={categoryNames}
                entry={entry}
                financialAccounts={financialAccounts}
                movementTypeDisplayPreference={movementTypeDisplayPreference}
                key={`${entry.type}:${entry.id}`}
                onDeleteMovement={onDeleteMovement}
                onDeleteRefund={onDeleteRefund}
                onEditMovement={onEditMovement}
                onRecordsChanged={onRecordsChanged}
                onUndoRecurringPayment={onUndoRecurringPayment}
              />
            ))}
          </ol>
        ) : (
          <ol aria-label="Movimientos por categoría" className="movement-categories__list">
            {categoryGroups.slice(0, 4).map((group) => {
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
                    <MovementTypeBadge
                      kind={group.kind}
                      preference={movementTypeDisplayPreference}
                    />
                    <strong>{categoryNames.get(group.categoryId) ?? 'Categoría'}</strong>
                    <output>{formatMoney(group.total.toFixed(2), group.currency)}</output>
                    <ChevronDown
                      aria-hidden="true"
                      className="movement-category__chevron"
                      size={18}
                    />
                  </button>
                  <ol className="movement-category__entries" hidden={!isExpanded} id={entriesId}>
                    {group.entries.slice(0, 3).map((entry) => (
                      <HistoryEntry
                        categoryNames={categoryNames}
                        entry={entry}
                        financialAccounts={financialAccounts}
                        movementTypeDisplayPreference={movementTypeDisplayPreference}
                        key={`${entry.type}:${entry.id}`}
                        onDeleteMovement={onDeleteMovement}
                        onDeleteRefund={onDeleteRefund}
                        onEditMovement={onEditMovement}
                        onRecordsChanged={onRecordsChanged}
                        onUndoRecurringPayment={onUndoRecurringPayment}
                      />
                    ))}
                    {group.entries.length > 3 ? (
                      <li className="movement-category__more">
                        {group.entries.length - 3} movimientos más
                      </li>
                    ) : null}
                  </ol>
                </li>
              );
            })}
            {categoryGroups.length > 4 ? (
              <li className="movement-category__more">
                {categoryGroups.length - 4} categorías más
              </li>
            ) : null}
          </ol>
        )
      ) : (
        <p className="movement-history__empty">
          {isLoading
            ? ' '
            : view === 'categories'
              ? 'No hay movimientos en este período.'
              : 'Todavía no hay movimientos.'}
        </p>
      )}

      {historyEntries.length > 0 ? (
        <button
          aria-haspopup="dialog"
          className="movement-history__view-all"
          onClick={() => historyDialogRef.current?.showModal()}
          type="button"
        >
          Ver todos los movimientos
          <ChevronRight aria-hidden="true" size={18} />
        </button>
      ) : null}

      <dialog
        aria-labelledby="movement-history-dialog-title"
        className="movement-history-dialog"
        ref={historyDialogRef}
      >
        <div className="movement-history-dialog__content">
          <header className="movement-history-dialog__header">
            <div>
              <p className="eyebrow">Historial</p>
              <h2 id="movement-history-dialog-title">Todos los movimientos</h2>
              <p>{dialogEntries.length} movimientos</p>
            </div>
            <button
              aria-label="Cerrar historial"
              className="movement-history-dialog__close"
              onClick={() => historyDialogRef.current?.close()}
              type="button"
            >
              <X aria-hidden="true" size={19} />
            </button>
          </header>
          <div className="movement-history-dialog__filters">
            <label className="visually-hidden" htmlFor="history-kind-filter-full">
              Tipo de movimiento
            </label>
            <select
              id="history-kind-filter-full"
              onChange={(event) => setKindFilter(event.target.value as HistoryKindFilter)}
              value={kindFilter}
            >
              <option value="all">Todos</option>
              <option value="expense">Gastos</option>
              <option value="income">Ingresos</option>
            </select>
          </div>
          {historyDays.map((day, index) => {
            const dayLabel = formatHistoryDay(day.date);
            return (
              <section
                aria-labelledby={`movement-history-day-${index}`}
                className="movement-history-day"
                key={day.date}
              >
                <h3 id={`movement-history-day-${index}`}>
                  <time dateTime={day.date}>{dayLabel}</time>
                </h3>
                <ol aria-label={`Movimientos del ${dayLabel}`} className="movement-history__list">
                  {day.entries.map((entry) => (
                    <HistoryEntry
                      categoryNames={categoryNames}
                      entry={entry}
                      financialAccounts={financialAccounts}
                      movementTypeDisplayPreference={movementTypeDisplayPreference}
                      key={`${entry.type}:${entry.id}`}
                      onDeleteMovement={onDeleteMovement}
                      onDeleteRefund={onDeleteRefund}
                      onEditMovement={onEditMovement}
                      onRecordsChanged={onRecordsChanged}
                      onUndoRecurringPayment={onUndoRecurringPayment}
                      showDate={false}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </dialog>
    </section>
  );
}

type MovementTypeBadgeProps = {
  kind: MovementKindDisplay;
  preference: MovementTypeDisplayPreference;
};

function MovementTypeBadge({ kind, preference }: MovementTypeBadgeProps) {
  return (
    <span
      aria-label={getMovementTypeLabel(kind, 'words')}
      className={`movement-row__kind movement-row__kind--${kind}`}
      role="img"
    >
      {getMovementTypeLabel(kind, preference)}
    </span>
  );
}

function HistoryEntry({
  entry,
  showDate = true,
  movementTypeDisplayPreference,
  categoryNames,
  financialAccounts,
  onEditMovement,
  onDeleteMovement,
  onDeleteRefund,
  onRecordsChanged,
  onUndoRecurringPayment,
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
              {showDate ? (
                <time dateTime={entry.sortDate}>{formatCivilDate(entry.sortDate)}</time>
              ) : null}
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
  const transactionLabel = entry.movement.kind === 'expense' ? 'pago' : 'cobro';
  return (
    <li className="movement-row">
      <details className="movement-entry">
        <summary className="movement-entry__summary">
          <MovementTypeBadge
            kind={entry.movement.kind}
            preference={movementTypeDisplayPreference}
          />
          <span className="movement-entry__summary-main">
            <strong>{categoryName}</strong>
            {showDate ? (
              <time dateTime={entry.movement.occurred_on}>
                {formatCivilDate(entry.movement.occurred_on)}
              </time>
            ) : null}
          </span>
          <strong className="movement-row__amount">
            {formatMoney(entry.movement.amount, entry.movement.currency)}
          </strong>
        </summary>
        <div className="movement-entry__expanded">
          {entry.movement.note ? <p>{entry.movement.note}</p> : null}
          {entry.recurringPayment ? (
            <p>
              {transactionLabel === 'pago' ? 'Pago' : 'Cobro'} recurrente · vencía{' '}
              {formatCivilDate(entry.recurringPayment.due_on)}
            </p>
          ) : null}
          <span aria-label="Estado de sincronización" className="movement-row__sync-status">
            {syncStatusLabel(entry.movement.syncStatus ?? 'synced')}
          </span>
          <div className="movement-row__actions">
            {entry.recurringPayment ? (
              <button
                aria-label={`Deshacer ${transactionLabel} recurrente de ${categoryName}`}
                onClick={() => void onUndoRecurringPayment(entry.movement)}
                type="button"
              >
                Deshacer {transactionLabel}
              </button>
            ) : (
              <>
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
              </>
            )}
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
  const accountName =
    financialAccounts.find((account) => account.id === expense.financial_account_id)?.name ?? null;

  async function handleSaved(closeDialog: () => void) {
    await onRecordsChanged();
    closeDialog();
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
            <FullPageFormDialog dialogLabel="Editar devolución" triggerLabel="Editar devolución">
              {(closeDialog) => (
                <RefundForm
                  accountName={accountName}
                  categoryName={categoryName}
                  expense={expense}
                  onCancel={closeDialog}
                  onSaved={() => handleSaved(closeDialog)}
                  refund={refund}
                />
              )}
            </FullPageFormDialog>
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
      <FullPageFormDialog
        dialogLabel={`Registrar devolución de ${categoryName}`}
        triggerLabel="Registrar devolución"
      >
        {(closeDialog) => (
          <RefundForm
            accountName={accountName}
            categoryName={categoryName}
            expense={expense}
            onCancel={closeDialog}
            onSaved={() => handleSaved(closeDialog)}
            refund={null}
          />
        )}
      </FullPageFormDialog>
    </div>
  );
}

function latestDate(currentDate: string, candidateDates: string[]): string {
  return candidateDates.reduce(
    (latest, candidate) => (candidate > latest ? candidate : latest),
    currentDate,
  );
}

function getCurrentIsoWeek(): string {
  return getIsoWeekValue(new Date());
}

function getIsoWeekValue(date: Date): string {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  const week = Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;

  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

function getIsoWeekPeriod(value: string): SummaryPeriod {
  let match = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!match) {
    match = /^(\d{4})-W(\d{2})$/.exec(getCurrentIsoWeek());
  }
  if (!match) {
    return getSummaryPeriod(getCurrentPeriod());
  }

  const weekYear = Number(match[1]);
  const week = Number(match[2]);
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  const start = new Date(firstThursday);
  start.setUTCDate(start.getUTCDate() - 3 + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function getCategoryHistoryEntries(
  entries: HistoryEntryData[],
  period: SummaryPeriod,
): HistoryEntryData[] {
  const periodEntries: HistoryEntryData[] = [];

  for (const entry of entries) {
    const periodRefunds = entry.refunds.filter((refund) =>
      isWithinHistoryPeriod(refund.received_on, period),
    );

    if (entry.type === 'refunds') {
      if (periodRefunds.length > 0) {
        periodEntries.push({
          ...entry,
          sortDate: latestDate(
            '',
            periodRefunds.map((refund) => refund.received_on),
          ),
          refunds: periodRefunds,
        });
      }
      continue;
    }

    if (isWithinHistoryPeriod(entry.movement.occurred_on, period)) {
      periodEntries.push({
        ...entry,
        sortDate: latestDate(
          entry.movement.occurred_on,
          periodRefunds.map((refund) => refund.received_on),
        ),
        refunds: periodRefunds,
      });
    } else if (periodRefunds.length > 0) {
      periodEntries.push({
        type: 'refunds',
        id: `${entry.id}:refunds`,
        sortDate: latestDate(
          '',
          periodRefunds.map((refund) => refund.received_on),
        ),
        expense: entry.movement,
        refunds: periodRefunds,
      });
    }
  }

  return periodEntries.sort(
    (left, right) => right.sortDate.localeCompare(left.sortDate) || left.id.localeCompare(right.id),
  );
}

function isWithinHistoryPeriod(date: string, period: SummaryPeriod): boolean {
  return date >= period.start && date <= period.end;
}

function formatHistoryDay(date: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function sumRefunds(refunds: Refund[]): Big {
  return refunds.reduce((total, refund) => total.plus(refund.amount), new Big(0));
}
