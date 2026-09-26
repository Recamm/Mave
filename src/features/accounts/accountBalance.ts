import Big from 'big.js';
import { parseDecimal, serializeDecimal } from '../../lib/money/decimal';

export type AccountBalanceCurrency = 'ARS' | 'USD';

export type AccountBalance = {
  accountId: string;
  balance: string;
  currency: AccountBalanceCurrency;
};

export type AccountBalanceInput = {
  accounts: readonly {
    currency: AccountBalanceCurrency;
    id: string;
    openingBalance: string | null;
  }[];
  movements: readonly {
    amount: string;
    currency: AccountBalanceCurrency;
    financialAccountId: string | null;
    id: string;
    kind: 'income' | 'expense';
  }[];
  refunds: readonly {
    amount: string;
    expenseId: string;
  }[];
  transfers: readonly {
    amount: string;
    destinationAccountId: string;
    sourceAccountId: string;
  }[];
};

type MutableBalance = {
  balance: Big;
  currency: AccountBalanceCurrency;
};

export function calculateAccountBalances(input: AccountBalanceInput): AccountBalance[] {
  const balances = new Map<string, MutableBalance>();
  const movementsById = new Map(input.movements.map((movement) => [movement.id, movement]));

  for (const account of input.accounts) {
    if (balances.has(account.id)) {
      throw new Error('Financial account ids must be unique.');
    }

    balances.set(account.id, {
      balance: parseDecimal(account.openingBalance ?? '0'),
      currency: account.currency,
    });
  }

  for (const movement of input.movements) {
    if (!movement.financialAccountId) {
      continue;
    }

    const balance = requireAccountBalance(balances, movement.financialAccountId);
    assertCurrency(balance.currency, movement.currency);
    const amount = parseDecimal(movement.amount);
    balance.balance =
      movement.kind === 'income' ? balance.balance.plus(amount) : balance.balance.minus(amount);
  }

  for (const refund of input.refunds) {
    const expense = movementsById.get(refund.expenseId);
    if (!expense || expense.kind !== 'expense') {
      throw new Error('Refund parent is unavailable.');
    }

    if (!expense.financialAccountId) {
      continue;
    }

    const balance = requireAccountBalance(balances, expense.financialAccountId);
    assertCurrency(balance.currency, expense.currency);
    balance.balance = balance.balance.plus(parseDecimal(refund.amount));
  }

  for (const transfer of input.transfers) {
    const source = requireAccountBalance(balances, transfer.sourceAccountId);
    const destination = requireAccountBalance(balances, transfer.destinationAccountId);
    assertCurrency(source.currency, destination.currency);
    const amount = parseDecimal(transfer.amount);
    source.balance = source.balance.minus(amount);
    destination.balance = destination.balance.plus(amount);
  }

  return input.accounts.map((account) => {
    const balance = requireAccountBalance(balances, account.id);
    return {
      accountId: account.id,
      balance: serializeDecimal(balance.balance),
      currency: balance.currency,
    };
  });
}

function requireAccountBalance(
  balances: Map<string, MutableBalance>,
  accountId: string,
): MutableBalance {
  const balance = balances.get(accountId);
  if (!balance) {
    throw new Error('Financial account is unavailable.');
  }

  return balance;
}

function assertCurrency(
  accountCurrency: AccountBalanceCurrency,
  activityCurrency: AccountBalanceCurrency,
): void {
  if (accountCurrency !== activityCurrency) {
    throw new Error('Financial activity currency does not match its account.');
  }
}
