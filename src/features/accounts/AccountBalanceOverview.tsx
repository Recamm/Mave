import { Link } from 'react-router-dom';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { formatMoney } from '../../lib/money/format';
import type { Movement } from '../movements/movementService';
import type { Refund } from '../movements/refundService';
import { calculateAccountBalances } from './accountBalance';
import type { FinancialAccount } from './accountService';
import type { Transfer } from './transferService';
import { calculatePeriodSummary, getSummaryPeriod } from '../summaries/periodSummary';

type AccountBalanceOverviewProps = {
  accounts: FinancialAccount[];
  period: string;
  selectedAccountId: string;
  hasLoadError: boolean;
  isLoading: boolean;
  movements: Movement[];
  refunds: Refund[];
  transfers: Transfer[];
};

export function AccountBalanceOverview({
  accounts,
  period,
  selectedAccountId,
  hasLoadError,
  isLoading,
  movements,
  refunds,
  transfers,
}: AccountBalanceOverviewProps) {
  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) ?? null;
  let balance: string | null = null;
  let income = '0';
  let expenses = '0';
  let hasCalculationError = false;

  if (!isLoading && !hasLoadError && selectedAccount) {
    try {
      const balances = calculateAccountBalances({
        accounts: accounts.map(({ currency, id, openingBalance }) => ({
          currency,
          id,
          openingBalance,
        })),
        movements: movements.map(({ amount, currency, financial_account_id, id, kind }) => ({
          amount,
          currency,
          financialAccountId: financial_account_id,
          id,
          kind,
        })),
        refunds: refunds.map(({ amount, expense_id }) => ({ amount, expenseId: expense_id })),
        transfers: transfers.map(({ amount, destination_account_id, source_account_id }) => ({
          amount,
          destinationAccountId: destination_account_id,
          sourceAccountId: source_account_id,
        })),
      });
      balance = balances.find((item) => item.accountId === selectedAccount.id)?.balance ?? null;

      const accountMovements = movements.filter(
        (movement) => movement.financial_account_id === selectedAccount.id,
      );
      const movementIds = new Set(accountMovements.map((movement) => movement.id));
      const accountRefunds = refunds.filter((refund) => movementIds.has(refund.expense_id));
      const summary = calculatePeriodSummary({
        period: getSummaryPeriod(period),
        movements: accountMovements.map((movement) => ({
          id: movement.id,
          kind: movement.kind,
          amount: movement.amount,
          currency: movement.currency,
          categoryId: movement.category_id,
          occurredOn: movement.occurred_on,
        })),
        refunds: accountRefunds.map((refund) => ({
          id: refund.id,
          expenseId: refund.expense_id,
          amount: refund.amount,
          receivedOn: refund.received_on,
        })),
      });

      income = summary.totalsByCurrency[selectedAccount.currency].income;
      expenses = summary.totalsByCurrency[selectedAccount.currency].netExpenses;
    } catch {
      hasCalculationError = true;
    }
  }

  return (
    <section aria-label="Balance de la cuenta seleccionada" className="dashboard-balance">
      {isLoading ? (
        <LoadingIndicator label="Cargando balance" />
      ) : hasLoadError ? (
        <FeedbackMessage tone="error">
          No se pudieron cargar los saldos de tus cuentas.
        </FeedbackMessage>
      ) : accounts.length === 0 ? (
        <div className="dashboard-balance__empty">
          <p>Todavía no tienes una cuenta.</p>
          <Link className="dashboard-action" to="/accounts">
            Agregar cuenta
          </Link>
        </div>
      ) : !selectedAccount ? (
        <FeedbackMessage tone="error">Selecciona una cuenta para ver el balance.</FeedbackMessage>
      ) : hasCalculationError ? (
        <FeedbackMessage tone="error">
          No se pudieron calcular los saldos de tus cuentas.
        </FeedbackMessage>
      ) : (
        <>
          <div className="dashboard-balance__amount-group">
            <p>Balance</p>
            <output aria-label="Balance actual">
              {formatMoney(balance ?? '0', selectedAccount.currency)}
            </output>
          </div>
          <dl aria-label="Ingresos y egresos del mes" className="dashboard-flows">
            <div>
              <dt>Ingresos</dt>
              <dd>{formatMoney(income, selectedAccount.currency)}</dd>
            </div>
            <div>
              <dt>Egresos</dt>
              <dd>{formatMoney(expenses, selectedAccount.currency)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
