import { useEffect, useState } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { formatMoney } from '../../lib/money/format';
import { refundService } from '../movements/refundService';
import { movementService } from '../movements/movementService';
import { accountService, type FinancialAccount } from './accountService';
import { calculateAccountBalances, type AccountBalance } from './accountBalance';
import { TransferForm } from './TransferForm';
import { TransferHistory } from './TransferHistory';
import { transferService, type Transfer } from './transferService';

type AccountsOverview = {
  accounts: FinancialAccount[];
  balances: AccountBalance[];
  transfers: Transfer[];
};

const accountKindLabels = {
  cash: 'Efectivo',
  bank: 'Banco',
  wallet: 'Billetera',
  other: 'Otra fuente',
} as const;

export function AccountsPage() {
  const [overview, setOverview] = useState<AccountsOverview | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadOverview() {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const [accounts, movements, refunds, transfers] = await Promise.all([
          accountService.listAccounts(),
          movementService.listMovements(),
          refundService.listRefunds(),
          transferService.listTransfers(),
        ]);
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

        if (isActive) {
          setOverview({ accounts, balances, transfers });
        }
      } catch {
        if (isActive) {
          setHasLoadError(true);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadOverview();
    return () => {
      isActive = false;
    };
  }, [refreshKey]);

  const accounts = overview?.accounts ?? [];
  const balanceByAccountId = new Map(
    (overview?.balances ?? []).map((balance) => [balance.accountId, balance]),
  );

  function refreshOverview() {
    setRefreshKey((currentKey) => currentKey + 1);
  }

  return (
    <main className="movement-page accounts-page">
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Organización financiera</p>
          <h1>Cuentas y transferencias</h1>
        </div>
        <button onClick={refreshOverview} type="button">
          Actualizar
        </button>
      </header>

      {hasLoadError ? (
        <div className="accounts-page__load-error">
          <FeedbackMessage tone="error">
            No se pudieron cargar las cuentas y transferencias. Inténtalo de nuevo.
          </FeedbackMessage>
        </div>
      ) : null}

      <div className="accounts-page__grid">
        <div className="accounts-page__column">
          <section className="accounts-panel" aria-labelledby="accounts-list-heading">
            <header className="accounts-panel__heading">
              <h2 id="accounts-list-heading">Saldos por cuenta</h2>
              <span>{accounts.length}</span>
            </header>
            {overview ? (
              accounts.length > 0 ? (
                <ul className="financial-account-list" aria-label="Cuentas financieras">
                  {accounts.map((account) => {
                    const balance = balanceByAccountId.get(account.id);
                    return (
                      <li className="financial-account-row" key={account.id}>
                        <div className="financial-account-row__details">
                          <h3>{account.name}</h3>
                          <p>
                            {accountKindLabels[account.kind]} <span aria-hidden="true">·</span>{' '}
                            {account.currency}
                          </p>
                        </div>
                        <strong className="financial-account-row__balance">
                          {formatMoney(balance?.balance ?? '0', account.currency)}
                        </strong>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="accounts-panel__empty">Todavía no hay cuentas financieras.</p>
              )
            ) : isLoading ? (
              <FeedbackMessage tone="info">Cargando saldos.</FeedbackMessage>
            ) : null}
          </section>

          <FinancialAccountForm onCreated={refreshOverview} />
        </div>

        <div className="accounts-page__column">
          <TransferForm accounts={accounts} onRecorded={refreshOverview} />
          <TransferHistory accounts={accounts} transfers={overview?.transfers ?? []} />
        </div>
      </div>
    </main>
  );
}

function FinancialAccountForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<FinancialAccount['kind']>('cash');
  const [currency, setCurrency] = useState<FinancialAccount['currency']>('ARS');
  const [openingBalance, setOpeningBalance] = useState('');
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      await accountService.createAccount({ name, kind, currency, openingBalance });
      setName('');
      setOpeningBalance('');
      setFeedback({ message: 'Cuenta creada.', tone: 'success' });
      onCreated();
    } catch (error) {
      setFeedback({
        message:
          error instanceof Error && error.name === 'FinancialAccountInputError'
            ? error.message
            : 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.',
        tone: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="account-editor" aria-labelledby="account-editor-heading">
      <header className="account-editor__heading">
        <h2 id="account-editor-heading">Agregar cuenta</h2>
      </header>
      <form aria-label="Crear cuenta financiera" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="account-name">Nombre de cuenta</label>
        <input
          autoComplete="off"
          id="account-name"
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />

        <label htmlFor="account-kind">Tipo de cuenta</label>
        <select
          id="account-kind"
          onChange={(event) => setKind(event.target.value as FinancialAccount['kind'])}
          value={kind}
        >
          <option value="cash">Efectivo</option>
          <option value="bank">Banco</option>
          <option value="wallet">Billetera</option>
          <option value="other">Otra fuente</option>
        </select>

        <label htmlFor="account-currency">Moneda</label>
        <select
          id="account-currency"
          onChange={(event) => setCurrency(event.target.value as FinancialAccount['currency'])}
          value={currency}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>

        <label htmlFor="account-opening-balance">Saldo inicial (opcional)</label>
        <input
          autoComplete="off"
          id="account-opening-balance"
          inputMode="decimal"
          onChange={(event) => setOpeningBalance(event.target.value)}
          placeholder="0,00"
          value={openingBalance}
        />

        {feedback ? (
          <p
            className={`account-editor__feedback account-editor__feedback--${feedback.tone}`}
            role={feedback.tone === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
        <button className="button-primary" disabled={isSubmitting} type="submit">
          Crear cuenta
        </button>
      </form>
    </section>
  );
}
