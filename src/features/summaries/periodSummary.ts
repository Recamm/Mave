import Big from 'big.js';
import { parseDecimal, serializeDecimal } from '../../lib/money/decimal';

export type SummaryCurrency = 'ARS' | 'USD';
export type SummaryKind = 'income' | 'expense';

export type SummaryPeriod = {
  start: string;
  end: string;
};

export type SummaryMovement = {
  id: string;
  kind: SummaryKind;
  amount: string;
  currency: SummaryCurrency;
  categoryId: string;
  occurredOn: string;
};

export type SummaryRefund = {
  id: string;
  expenseId: string;
  amount: string;
  receivedOn: string;
};

export type SummaryTransfer = {
  id: string;
  amount: string;
  currency: SummaryCurrency;
  occurredOn: string;
};

export type SummaryTotals = {
  income: string;
  grossExpenses: string;
  refunds: string;
  netExpenses: string;
  netDifference: string;
};

export type CategoryPeriodSummary = SummaryTotals & {
  categoryId: string;
  currency: SummaryCurrency;
};

export type PeriodSummaryInput = {
  period: SummaryPeriod;
  movements: readonly SummaryMovement[];
  refunds: readonly SummaryRefund[];
  transfers?: readonly SummaryTransfer[];
};

export type PeriodSummaryResult = {
  isEmpty: boolean;
  totalsByCurrency: Record<SummaryCurrency, SummaryTotals>;
  categories: CategoryPeriodSummary[];
};

export function getCurrentPeriod(now: Date = new Date()): string {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getSummaryPeriod(month: string): SummaryPeriod {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);

  if (!match) {
    throw new Error('Period must use the YYYY-MM format.');
  }

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    start: `${match[1]}-${match[2]}-01`,
    end: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
  };
}

type MutableTotals = {
  income: Big;
  grossExpenses: Big;
  refunds: Big;
};

type MutableCategoryTotals = {
  categoryId: string;
  currency: SummaryCurrency;
  totals: MutableTotals;
};

function emptyTotals(): MutableTotals {
  return {
    income: new Big(0),
    grossExpenses: new Big(0),
    refunds: new Big(0),
  };
}

function serializeTotals(totals: MutableTotals): SummaryTotals {
  const netExpenses = totals.grossExpenses.minus(totals.refunds);

  return {
    income: serializeDecimal(totals.income),
    grossExpenses: serializeDecimal(totals.grossExpenses),
    refunds: serializeDecimal(totals.refunds),
    netExpenses: serializeDecimal(netExpenses),
    netDifference: serializeDecimal(totals.income.minus(netExpenses)),
  };
}

function isWithinPeriod(date: string, period: SummaryPeriod): boolean {
  return date >= period.start && date <= period.end;
}

export function calculatePeriodSummary(input: PeriodSummaryInput): PeriodSummaryResult {
  const totalsByCurrency: Record<SummaryCurrency, MutableTotals> = {
    ARS: emptyTotals(),
    USD: emptyTotals(),
  };
  const categoryTotals = new Map<string, MutableCategoryTotals>();
  const movementsById = new Map(input.movements.map((movement) => [movement.id, movement]));
  let itemCount = 0;

  function categoryBucket(categoryId: string, currency: SummaryCurrency): MutableTotals {
    const key = `${currency}:${categoryId}`;
    let category = categoryTotals.get(key);

    if (!category) {
      category = { categoryId, currency, totals: emptyTotals() };
      categoryTotals.set(key, category);
    }

    return category.totals;
  }

  for (const movement of input.movements) {
    if (!isWithinPeriod(movement.occurredOn, input.period)) {
      continue;
    }

    itemCount += 1;
    const amount = parseDecimal(movement.amount);
    const currencyTotals = totalsByCurrency[movement.currency];
    const groupTotals = categoryBucket(movement.categoryId, movement.currency);

    if (movement.kind === 'income') {
      currencyTotals.income = currencyTotals.income.plus(amount);
      groupTotals.income = groupTotals.income.plus(amount);
    } else {
      currencyTotals.grossExpenses = currencyTotals.grossExpenses.plus(amount);
      groupTotals.grossExpenses = groupTotals.grossExpenses.plus(amount);
    }
  }

  for (const refund of input.refunds) {
    if (!isWithinPeriod(refund.receivedOn, input.period)) {
      continue;
    }

    const expense = movementsById.get(refund.expenseId);
    if (!expense || expense.kind !== 'expense') {
      throw new Error('Refund parent is unavailable.');
    }

    itemCount += 1;
    const amount = parseDecimal(refund.amount);
    totalsByCurrency[expense.currency].refunds =
      totalsByCurrency[expense.currency].refunds.plus(amount);
    const groupTotals = categoryBucket(expense.categoryId, expense.currency);
    groupTotals.refunds = groupTotals.refunds.plus(amount);
  }

  const categories = [...categoryTotals.values()]
    .map(({ categoryId, currency, totals }) => ({
      categoryId,
      currency,
      ...serializeTotals(totals),
    }))
    .sort(
      (left, right) =>
        left.categoryId.localeCompare(right.categoryId) ||
        left.currency.localeCompare(right.currency),
    );

  return {
    isEmpty: itemCount === 0,
    totalsByCurrency: {
      ARS: serializeTotals(totalsByCurrency.ARS),
      USD: serializeTotals(totalsByCurrency.USD),
    },
    categories,
  };
}
