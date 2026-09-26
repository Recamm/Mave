import { describe, expect, it } from 'vitest';
import { calculateAccountBalances } from '../../src/features/accounts/accountBalance';
import { calculatePeriodSummary } from '../../src/features/summaries/periodSummary';

describe('account balances and period summaries', () => {
  it('derives balances from ledger activity without counting transfers as income or expenses', () => {
    const accounts = [
      { id: 'cash', currency: 'ARS' as const, openingBalance: '1000.00' },
      { id: 'bank', currency: 'ARS' as const, openingBalance: null },
      { id: 'wallet-usd', currency: 'USD' as const, openingBalance: '25.00' },
    ];
    const movements = [
      {
        id: 'salary',
        kind: 'income' as const,
        amount: '500.00',
        currency: 'ARS' as const,
        categoryId: 'income',
        occurredOn: '2026-09-10',
        financialAccountId: 'cash',
      },
      {
        id: 'cash-expense',
        kind: 'expense' as const,
        amount: '300.00',
        currency: 'ARS' as const,
        categoryId: 'food',
        occurredOn: '2026-09-11',
        financialAccountId: 'cash',
      },
      {
        id: 'bank-expense',
        kind: 'expense' as const,
        amount: '70.00',
        currency: 'ARS' as const,
        categoryId: 'food',
        occurredOn: '2026-09-12',
        financialAccountId: 'bank',
      },
      {
        id: 'usd-income',
        kind: 'income' as const,
        amount: '5.00',
        currency: 'USD' as const,
        categoryId: 'income',
        occurredOn: '2026-09-13',
        financialAccountId: 'wallet-usd',
      },
    ];
    const refunds = [
      { id: 'cash-refund', expenseId: 'cash-expense', amount: '100.00', receivedOn: '2026-09-14' },
    ];
    const transfers = [
      {
        id: 'cash-to-bank',
        sourceAccountId: 'cash',
        destinationAccountId: 'bank',
        amount: '200.00',
        occurredOn: '2026-09-15',
      },
    ];

    expect(calculateAccountBalances({ accounts, movements, refunds, transfers })).toEqual([
      { accountId: 'cash', currency: 'ARS', balance: '1100' },
      { accountId: 'bank', currency: 'ARS', balance: '130' },
      { accountId: 'wallet-usd', currency: 'USD', balance: '30' },
    ]);

    const summary = calculatePeriodSummary({
      period: { start: '2026-09-01', end: '2026-09-30' },
      movements: movements.map(({ amount, categoryId, currency, id, kind, occurredOn }) => ({
        amount,
        categoryId,
        currency,
        id,
        kind,
        occurredOn,
      })),
      refunds: refunds.map(({ expenseId, ...refund }) => ({ ...refund, expenseId })),
      transfers: transfers.map((transfer) => ({
        id: transfer.id,
        amount: transfer.amount,
        currency: 'ARS' as const,
        occurredOn: transfer.occurredOn,
      })),
    });

    expect(summary.totalsByCurrency.ARS).toEqual({
      income: '500',
      grossExpenses: '370',
      refunds: '100',
      netExpenses: '270',
      netDifference: '230',
    });
    expect(summary.totalsByCurrency.USD.netDifference).toBe('5');
  });
});
