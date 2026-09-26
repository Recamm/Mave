import { describe, expect, it } from 'vitest';
import { calculatePeriodSummary } from '../../../src/features/summaries/periodSummary';

const september = { start: '2026-09-01', end: '2026-09-30' };

describe('calculatePeriodSummary', () => {
  it('keeps currencies separate and excludes transfers from income and expenses', () => {
    const summary = calculatePeriodSummary({
      period: september,
      movements: [
        {
          id: 'income-ars',
          kind: 'income',
          amount: '1000',
          currency: 'ARS',
          categoryId: 'salary',
          occurredOn: '2026-09-02',
        },
        {
          id: 'expense-ars',
          kind: 'expense',
          amount: '300',
          currency: 'ARS',
          categoryId: 'food',
          occurredOn: '2026-09-03',
        },
        {
          id: 'income-usd',
          kind: 'income',
          amount: '10',
          currency: 'USD',
          categoryId: 'salary',
          occurredOn: '2026-09-04',
        },
        {
          id: 'expense-usd',
          kind: 'expense',
          amount: '3',
          currency: 'USD',
          categoryId: 'food',
          occurredOn: '2026-09-05',
        },
      ],
      refunds: [],
      transfers: [
        {
          id: 'transfer-ars',
          amount: '90000',
          currency: 'ARS',
          occurredOn: '2026-09-06',
        },
        {
          id: 'transfer-usd',
          amount: '900',
          currency: 'USD',
          occurredOn: '2026-09-07',
        },
      ],
    });

    expect(summary.totalsByCurrency).toEqual({
      ARS: {
        income: '1000',
        grossExpenses: '300',
        refunds: '0',
        netExpenses: '300',
        netDifference: '700',
      },
      USD: {
        income: '10',
        grossExpenses: '3',
        refunds: '0',
        netExpenses: '3',
        netDifference: '7',
      },
    });
    expect(summary.categories).toHaveLength(4);
  });

  it('subtracts refunds in their received period and groups them by the parent expense', () => {
    const summary = calculatePeriodSummary({
      period: september,
      movements: [
        {
          id: 'old-expense',
          kind: 'expense',
          amount: '80.25',
          currency: 'ARS',
          categoryId: 'food',
          occurredOn: '2026-08-31',
        },
        {
          id: 'current-expense',
          kind: 'expense',
          amount: '120',
          currency: 'ARS',
          categoryId: 'food',
          occurredOn: '2026-09-12',
        },
        {
          id: 'current-income',
          kind: 'income',
          amount: '50',
          currency: 'ARS',
          categoryId: 'salary',
          occurredOn: '2026-09-10',
        },
      ],
      refunds: [
        {
          id: 'refund-old-expense',
          expenseId: 'old-expense',
          amount: '80.25',
          receivedOn: '2026-09-05',
        },
        {
          id: 'refund-current-expense',
          expenseId: 'current-expense',
          amount: '20',
          receivedOn: '2026-09-15',
        },
        {
          id: 'refund-outside-period',
          expenseId: 'current-expense',
          amount: '10',
          receivedOn: '2026-08-30',
        },
      ],
      transfers: [],
    });

    expect(summary.totalsByCurrency.ARS).toEqual({
      income: '50',
      grossExpenses: '120',
      refunds: '100.25',
      netExpenses: '19.75',
      netDifference: '30.25',
    });
    expect(summary.categories).toContainEqual({
      categoryId: 'food',
      currency: 'ARS',
      income: '0',
      grossExpenses: '120',
      refunds: '100.25',
      netExpenses: '19.75',
      netDifference: '-19.75',
    });
    expect(summary.totalsByCurrency.ARS.income).toBe('50');
  });

  it('returns explicit zero totals and no category rows for an empty period', () => {
    const summary = calculatePeriodSummary({
      period: september,
      movements: [
        {
          id: 'outside-expense',
          kind: 'expense',
          amount: '25',
          currency: 'ARS',
          categoryId: 'food',
          occurredOn: '2026-08-31',
        },
      ],
      refunds: [],
      transfers: [],
    });

    expect(summary.isEmpty).toBe(true);
    expect(summary.categories).toEqual([]);
    expect(summary.totalsByCurrency.ARS).toEqual({
      income: '0',
      grossExpenses: '0',
      refunds: '0',
      netExpenses: '0',
      netDifference: '0',
    });
  });
});
