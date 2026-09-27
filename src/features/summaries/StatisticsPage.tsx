import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { useAuthSession } from '../../app/useAuthSession';
import { addDecimals, parseDecimal } from '../../lib/money/decimal';
import { formatMoney } from '../../lib/money/format';
import { categoryService, type Category } from '../categories/categoryService';
import type { Movement } from '../movements/movementService';
import type { Refund } from '../movements/refundService';
import { readOwnerLookups } from '../sync/ownerLookupCache';
import { syncEngine } from '../sync/syncEngine';
import {
  calculatePeriodSummary,
  getCurrentPeriod,
  getSummaryPeriod,
  type SummaryCurrency,
} from './periodSummary';
import { summaryService } from './summaryService';

type DailyActivity = {
  day: number;
  expenses: string;
  income: string;
  refunds: string;
};

type CategoryExpense = {
  amount: string;
  categoryId: string;
  name: string;
  percentage: number;
  startPercentage: number;
  color: string;
};

const chartColors = [
  'var(--statistics-chart-1)',
  'var(--statistics-chart-2)',
  'var(--statistics-chart-3)',
  'var(--statistics-chart-4)',
  'var(--statistics-chart-5)',
  'var(--statistics-chart-6)',
  'var(--statistics-chart-7)',
  'var(--statistics-chart-8)',
];

const activitySeries = [
  { key: 'income', label: 'Ingresos', color: 'var(--statistics-income)' },
  { key: 'expenses', label: 'Gastos', color: 'var(--statistics-expenses)' },
  { key: 'refunds', label: 'Devoluciones', color: 'var(--statistics-refunds)' },
] as const;

export function StatisticsPage() {
  const { session } = useAuthSession();
  const ownerId = session?.user.id ?? null;
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [currency, setCurrency] = useState<SummaryCurrency>('ARS');
  const [movements, setMovements] = useState<Movement[]>([]);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadStatistics() {
      setIsLoading(true);
      setHasLoadError(false);

      if (ownerId) {
        try {
          const [localMovements, cachedLookups] = await Promise.all([
            syncEngine.listVisibleMovements(ownerId, []),
            Promise.resolve(readOwnerLookups(ownerId)),
          ]);
          if (isCurrent) {
            setMovements(localMovements);
            if (cachedLookups) {
              setCategories(cachedLookups.categories);
            }
          }
        } catch {
          // The online records below can still populate the statistics.
        }
      }

      try {
        const [records, loadedCategories] = await Promise.all([
          summaryService.listPeriodRecords(),
          categoryService.listCategories(),
        ]);
        const visibleMovements = ownerId
          ? await syncEngine.listVisibleMovements(ownerId, records.movements)
          : records.movements;

        if (isCurrent) {
          setMovements(visibleMovements);
          setRefunds(records.refunds);
          setCategories(loadedCategories);
        }
      } catch {
        if (isCurrent) {
          setHasLoadError(true);
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadStatistics();
    return () => {
      isCurrent = false;
    };
  }, [ownerId]);

  const currentPeriod = getCurrentPeriod();
  let summary = null;
  let calculationFailed = false;
  try {
    const range = getSummaryPeriod(period);
    summary = calculatePeriodSummary({
      period: range,
      movements: movements.map((movement) => ({
        id: movement.id,
        kind: movement.kind,
        amount: movement.amount,
        currency: movement.currency,
        categoryId: movement.category_id,
        occurredOn: movement.occurred_on,
      })),
      refunds: refunds.map((refund) => ({
        id: refund.id,
        expenseId: refund.expense_id,
        amount: refund.amount,
        receivedOn: refund.received_on,
      })),
    });
  } catch {
    calculationFailed = true;
  }

  const selectedTotals = summary?.totalsByCurrency[currency] ?? {
    income: '0',
    grossExpenses: '0',
    refunds: '0',
    netExpenses: '0',
    netDifference: '0',
  };
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const categoryTotals = (summary?.categories ?? [])
    .filter(
      (category) => category.currency === currency && parseDecimal(category.netExpenses).gt(0),
    )
    .sort((left, right) => parseDecimal(right.netExpenses).cmp(left.netExpenses));
  const chartTotal = categoryTotals.reduce(
    (total, category) => addDecimals(total, category.netExpenses),
    '0',
  );
  let accumulatedPercentage = 0;
  const categoryExpenses: CategoryExpense[] = categoryTotals.map((category, index) => {
    const percentage = parseDecimal(category.netExpenses).div(chartTotal).toNumber();
    const startPercentage = accumulatedPercentage;
    accumulatedPercentage += percentage;
    const expense = {
      amount: category.netExpenses,
      categoryId: category.categoryId,
      name: categoryNames.get(category.categoryId) ?? 'Categoría',
      percentage,
      startPercentage,
      color: chartColors[index % chartColors.length] ?? chartColors[0],
    };
    return expense;
  });
  const dailyActivity = getDailyActivity(period, currency, movements, refunds);

  function changePeriod(offset: number) {
    setPeriod(shiftPeriod(period, offset));
  }

  return (
    <main className="movement-page statistics-page">
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Ingresos, gastos y hábitos</p>
          <h1>Estadísticas</h1>
        </div>
      </header>

      <div aria-label="Navegación por mes" className="statistics-period-bar" role="group">
        <button
          aria-label="Mes anterior"
          onClick={() => changePeriod(-1)}
          title="Mes anterior"
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={19} />
        </button>
        <div className="statistics-period-bar__current">
          <label className="visually-hidden" htmlFor="statistics-period">
            Elegir mes
          </label>
          <input
            id="statistics-period"
            max={currentPeriod}
            onChange={(event) => {
              if (event.target.value) {
                setPeriod(event.target.value);
              }
            }}
            type="month"
            value={period}
          />
        </div>
        <button
          aria-label="Mes siguiente"
          disabled={period >= currentPeriod}
          onClick={() => changePeriod(1)}
          title="Mes siguiente"
          type="button"
        >
          <ChevronRight aria-hidden="true" size={19} />
        </button>
      </div>

      <div className="statistics-controls">
        <span>Moneda</span>
        <div
          aria-label="Moneda de las estadísticas"
          className="statistics-currency-switch"
          role="group"
        >
          <button
            aria-pressed={currency === 'ARS'}
            onClick={() => setCurrency('ARS')}
            type="button"
          >
            ARS
          </button>
          <button
            aria-pressed={currency === 'USD'}
            onClick={() => setCurrency('USD')}
            type="button"
          >
            USD
          </button>
        </div>
      </div>

      {isLoading ? <LoadingIndicator label="Cargando estadísticas" /> : null}
      {hasLoadError ? (
        <FeedbackMessage tone="error">
          Se muestran los datos disponibles en este dispositivo. No se pudo actualizar el período.
        </FeedbackMessage>
      ) : null}
      {calculationFailed ? (
        <FeedbackMessage tone="error">
          No se pudieron calcular las estadísticas de este período.
        </FeedbackMessage>
      ) : null}

      {!calculationFailed ? (
        <>
          <dl aria-label={`Resumen de ${currency}`} className="statistics-totals">
            <div>
              <dt>Ingresos</dt>
              <dd>
                <output aria-label={`Ingresos ${currency}`}>
                  {formatMoney(selectedTotals.income, currency)}
                </output>
              </dd>
            </div>
            <div>
              <dt>Gastos netos</dt>
              <dd>
                <output aria-label={`Gastos netos ${currency}`}>
                  {formatMoney(selectedTotals.netExpenses, currency)}
                </output>
              </dd>
            </div>
            <div>
              <dt>Devoluciones</dt>
              <dd>
                <output aria-label={`Devoluciones ${currency}`}>
                  {formatMoney(selectedTotals.refunds, currency)}
                </output>
              </dd>
            </div>
            <div>
              <dt>Diferencia neta</dt>
              <dd>
                <output aria-label={`Diferencia neta ${currency}`}>
                  {formatMoney(selectedTotals.netDifference, currency)}
                </output>
              </dd>
            </div>
          </dl>

          <section aria-labelledby="statistics-categories-title" className="statistics-section">
            <header className="statistics-section__heading">
              <div>
                <p className="eyebrow">Ordenado por importe</p>
                <h2 id="statistics-categories-title">Gastos por categoría</h2>
              </div>
              <strong>{formatMoney(chartTotal, currency)}</strong>
            </header>

            {categoryExpenses.length > 0 ? (
              <div className="statistics-spending">
                <figure className="statistics-donut">
                  <svg
                    aria-label={`Distribución de gastos netos por categoría en ${formatPeriod(period)}, ${currency}`}
                    className="statistics-donut__chart"
                    role="img"
                    viewBox="0 0 220 220"
                  >
                    <circle className="statistics-donut__track" cx="110" cy="110" r="76" />
                    {categoryExpenses.map((category) => {
                      const segmentLength = category.percentage * 2 * Math.PI * 76;
                      const segment = (
                        <circle
                          cx="110"
                          cy="110"
                          key={category.categoryId}
                          r="76"
                          stroke={category.color}
                          strokeDasharray={`${segmentLength} ${2 * Math.PI * 76 - segmentLength}`}
                          strokeDashoffset={-category.startPercentage * 2 * Math.PI * 76}
                          strokeWidth="32"
                          transform="rotate(-90 110 110)"
                        />
                      );
                      return segment;
                    })}
                  </svg>
                  <figcaption className="statistics-donut__center">
                    <span>Gasto neto</span>
                    <strong>{formatMoney(chartTotal, currency)}</strong>
                  </figcaption>
                </figure>
                <ol
                  aria-label="Categorías ordenadas por gasto neto"
                  className="statistics-category-list"
                >
                  {categoryExpenses.map((category, index) => (
                    <li key={category.categoryId}>
                      <span
                        aria-hidden="true"
                        className="statistics-category-list__swatch"
                        style={{ backgroundColor: category.color }}
                      />
                      <span className="statistics-category-list__rank">{index + 1}</span>
                      <strong>{category.name}</strong>
                      <span>{formatMoney(category.amount, currency)}</span>
                      <span>
                        {new Intl.NumberFormat('es-AR', {
                          style: 'percent',
                          maximumFractionDigits: 0,
                        }).format(category.percentage)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <p className="statistics-empty">No hay gastos netos para esta moneda y período.</p>
            )}
          </section>

          <section aria-labelledby="statistics-activity-title" className="statistics-section">
            <header className="statistics-section__heading">
              <div>
                <p className="eyebrow">Actividad diaria</p>
                <h2 id="statistics-activity-title">Ingresos, gastos y devoluciones</h2>
              </div>
            </header>
            <DailyActivityChart currency={currency} period={period} activity={dailyActivity} />
          </section>
        </>
      ) : null}
    </main>
  );
}

function DailyActivityChart({
  currency,
  period,
  activity,
}: {
  currency: SummaryCurrency;
  period: string;
  activity: DailyActivity[];
}) {
  const chartWidth = 720;
  const baseline = 176;
  const plotHeight = 150;
  const slotWidth = chartWidth / activity.length;
  const barWidth = Math.min(7, slotWidth * 0.19);
  const barGap = Math.min(2, slotWidth * 0.06);
  const maxAmount = Math.max(
    1,
    ...activity.flatMap((day) => [Number(day.income), Number(day.expenses), Number(day.refunds)]),
  );

  return (
    <figure className="statistics-activity">
      <svg
        aria-label={`Importes diarios de ingresos, gastos y devoluciones en ${formatPeriod(period)}, ${currency}`}
        className="statistics-activity__chart"
        role="img"
        viewBox="0 0 720 216"
      >
        <line
          className="statistics-activity__axis"
          x1="0"
          x2={chartWidth}
          y1={baseline}
          y2={baseline}
        />
        {activity.map((day, dayIndex) => {
          const seriesAmounts = [day.income, day.expenses, day.refunds];
          const groupWidth = barWidth * 3 + barGap * 2;
          const startX = dayIndex * slotWidth + (slotWidth - groupWidth) / 2;

          return (
            <g key={day.day}>
              {seriesAmounts.map((amount, seriesIndex) => {
                const amountNumber = Number(amount);
                const height =
                  amountNumber > 0 ? Math.max(2, (amountNumber / maxAmount) * plotHeight) : 0;
                const x = startX + seriesIndex * (barWidth + barGap);
                return (
                  <rect
                    fill={activitySeries[seriesIndex]?.color}
                    height={height}
                    key={activitySeries[seriesIndex]?.key}
                    rx="1"
                    width={barWidth}
                    x={x}
                    y={baseline - height}
                  >
                    <title>
                      {`${day.day}: ${activitySeries[seriesIndex]?.label} ${formatMoney(amount, currency)}`}
                    </title>
                  </rect>
                );
              })}
              {day.day === 1 || day.day % 7 === 0 || day.day === activity.length ? (
                <text
                  className="statistics-activity__day"
                  textAnchor="middle"
                  x={dayIndex * slotWidth + slotWidth / 2}
                  y="203"
                >
                  {day.day}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="statistics-activity__caption">
        <span>Importes registrados por día</span>
        <ul aria-label="Series del gráfico">
          {activitySeries.map((series) => (
            <li key={series.key}>
              <span aria-hidden="true" style={{ backgroundColor: series.color }} />
              {series.label}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

function getDailyActivity(
  period: string,
  currency: SummaryCurrency,
  movements: Movement[],
  refunds: Refund[],
): DailyActivity[] {
  const range = getSummaryPeriod(period);
  const daysInPeriod = Number(range.end.slice(-2));
  const activity = new Map<number, DailyActivity>();
  const movementsById = new Map(movements.map((movement) => [movement.id, movement]));

  for (let day = 1; day <= daysInPeriod; day += 1) {
    activity.set(day, { day, income: '0', expenses: '0', refunds: '0' });
  }

  for (const movement of movements) {
    if (
      movement.currency !== currency ||
      movement.occurred_on < range.start ||
      movement.occurred_on > range.end
    ) {
      continue;
    }

    const day = Number(movement.occurred_on.slice(-2));
    const dailyTotals = activity.get(day);
    if (!dailyTotals) {
      continue;
    }

    if (movement.kind === 'income') {
      dailyTotals.income = addDecimals(dailyTotals.income, movement.amount);
    } else {
      dailyTotals.expenses = addDecimals(dailyTotals.expenses, movement.amount);
    }
  }

  for (const refund of refunds) {
    if (refund.received_on < range.start || refund.received_on > range.end) {
      continue;
    }

    const expense = movementsById.get(refund.expense_id);
    if (!expense || expense.currency !== currency || expense.kind !== 'expense') {
      continue;
    }

    const day = Number(refund.received_on.slice(-2));
    const dailyTotals = activity.get(day);
    if (dailyTotals) {
      dailyTotals.refunds = addDecimals(dailyTotals.refunds, refund.amount);
    }
  }

  return [...activity.values()];
}

function shiftPeriod(period: string, offset: number): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatPeriod(period: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${period}-01T00:00:00Z`));
}
