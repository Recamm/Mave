import type { Category } from '../categories/categoryService';
import { formatMoney } from '../../lib/money/format';
import {
  calculatePeriodSummary,
  getSummaryPeriod,
  type PeriodSummaryResult,
} from './periodSummary';
import type { Movement } from '../movements/movementService';
import type { Refund } from '../movements/refundService';

type PeriodSummaryProps = {
  period: string;
  movements: Movement[];
  refunds: Refund[];
  categories: Category[];
  onPeriodChange: (period: string) => void;
};

function summarize(period: string, movements: Movement[], refunds: Refund[]): PeriodSummaryResult {
  return calculatePeriodSummary({
    period: getSummaryPeriod(period),
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
}

export function PeriodSummary({
  period,
  movements,
  refunds,
  categories,
  onPeriodChange,
}: PeriodSummaryProps) {
  const summary = summarize(period, movements, refunds);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));

  return (
    <section aria-label="Resumen del período" className="period-summary" role="region">
      <header className="period-summary__header">
        <h2>Resumen</h2>
        <label htmlFor="summary-period">Período</label>
        <input
          id="summary-period"
          onChange={(event) => {
            if (event.target.value) {
              onPeriodChange(event.target.value);
            }
          }}
          type="month"
          value={period}
        />
      </header>

      {summary.isEmpty ? (
        <p className="period-summary__empty">No hay movimientos en este período.</p>
      ) : (
        <>
          <dl aria-label="Totales por moneda" className="period-summary__totals">
            <div>
              <dt>Ingresos</dt>
              <dd>
                <output aria-label="Ingresos ARS">
                  {formatMoney(summary.totalsByCurrency.ARS.income, 'ARS')}
                </output>
                <output aria-label="Ingresos USD">
                  {formatMoney(summary.totalsByCurrency.USD.income, 'USD')}
                </output>
              </dd>
            </div>
            <div>
              <dt>Gastos netos</dt>
              <dd>
                <output aria-label="Gastos netos ARS">
                  {formatMoney(summary.totalsByCurrency.ARS.netExpenses, 'ARS')}
                </output>
                <output aria-label="Gastos netos USD">
                  {formatMoney(summary.totalsByCurrency.USD.netExpenses, 'USD')}
                </output>
              </dd>
            </div>
            <div>
              <dt>Diferencia neta</dt>
              <dd>
                <output aria-label="Diferencia neta ARS">
                  {formatMoney(summary.totalsByCurrency.ARS.netDifference, 'ARS')}
                </output>
                <output aria-label="Diferencia neta USD">
                  {formatMoney(summary.totalsByCurrency.USD.netDifference, 'USD')}
                </output>
              </dd>
            </div>
            <div>
              <dt>Devoluciones recibidas</dt>
              <dd>
                <output aria-label="Devoluciones recibidas ARS">
                  {formatMoney(summary.totalsByCurrency.ARS.refunds, 'ARS')}
                </output>
                <output aria-label="Devoluciones recibidas USD">
                  {formatMoney(summary.totalsByCurrency.USD.refunds, 'USD')}
                </output>
              </dd>
            </div>
          </dl>

          <section aria-labelledby="category-summary-title" className="period-summary__categories">
            <h3 id="category-summary-title">Por categoría</h3>
            <ol aria-label="Totales por categoría">
              {summary.categories.map((categorySummary) => (
                <li key={`${categorySummary.categoryId}:${categorySummary.currency}`}>
                  <strong>{categoryNames.get(categorySummary.categoryId) ?? 'Categoría'}</strong>
                  <span>{categorySummary.currency}</span>
                  <span>
                    Ingresos {formatMoney(categorySummary.income, categorySummary.currency)}
                  </span>
                  <span>
                    Gastos netos{' '}
                    {formatMoney(categorySummary.netExpenses, categorySummary.currency)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </section>
  );
}
