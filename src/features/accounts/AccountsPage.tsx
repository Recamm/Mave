import { ChevronDown, RotateCcw, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FullPageFormDialog } from '../../app/components/FullPageFormDialog';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { LoadingIndicator } from '../../app/components/LoadingIndicator';
import { useAuthSession } from '../../app/useAuthSession';
import { CategoryManager } from '../categories/CategoryManager';
import { categoryService, type Category } from '../categories/categoryService';
import { SavingsGoalsSection } from '../goals/GoalsPage';
import { formatMoney } from '../../lib/money/format';
import { refundService, type Refund } from '../movements/refundService';
import { movementService, type Movement } from '../movements/movementService';
import { accountService, type FinancialAccount } from './accountService';
import { getPrimaryAccountId, savePrimaryAccountId } from './primaryAccountPreference';
import { calculateAccountBalances, type AccountBalance } from './accountBalance';
import { TransferForm } from './TransferForm';
import { TransferHistory } from './TransferHistory';
import { transferService, type Transfer } from './transferService';
import { RecurringMovementsManagement } from '../movements/RecurringMovementsManagement';
import { PeriodSummary } from '../summaries/PeriodSummaryView';
import { getCurrentPeriod } from '../summaries/periodSummary';
import { readOwnerLookups, writeOwnerLookups } from '../sync/ownerLookupCache';
import { syncEngine } from '../sync/syncEngine';

type AccountsOverview = {
  accounts: FinancialAccount[];
  balances: AccountBalance[];
  movements: Movement[];
  refunds: Refund[];
  transfers: Transfer[];
};

const pullRefreshThreshold = 72;

const accountKindLabels = {
  cash: 'Efectivo',
  bank: 'Banco',
  wallet: 'Billetera',
  other: 'Otra fuente',
} as const;

export function AccountsPage() {
  const { session } = useAuthSession();
  const ownerId = session?.user.id ?? null;
  const [overview, setOverview] = useState<AccountsOverview | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [primaryAccountId, setPrimaryAccountId] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [categoriesLoadFailed, setCategoriesLoadFailed] = useState(false);
  const [accountActionFailed, setAccountActionFailed] = useState(false);
  const [permanentDeleteMessage, setPermanentDeleteMessage] = useState<string | null>(null);
  const [accountActionId, setAccountActionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const pullStartRef = useRef<{ x: number; y: number } | null>(null);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    let isActive = true;

    async function loadOverview() {
      setIsLoading(true);
      setHasLoadError(false);

      try {
        const [accountsResult, movementsResult, refundsResult, transfersResult, categoriesResult] =
          await Promise.allSettled([
            accountService.listAccounts({ includeArchived: true }),
            movementService.listMovements(),
            refundService.listRefunds(),
            transferService.listTransfers(),
            categoryService.listCategories(),
          ]);

        if (
          accountsResult.status === 'rejected' ||
          movementsResult.status === 'rejected' ||
          refundsResult.status === 'rejected' ||
          transfersResult.status === 'rejected'
        ) {
          throw new Error('The financial overview is unavailable.');
        }

        const accounts = accountsResult.value;
        const movements = movementsResult.value;
        const refunds = refundsResult.value;
        const transfers = transfersResult.value;
        const activeAccounts = accounts.filter((account) => account.archived_at === null);
        if (categoriesResult.status === 'fulfilled') {
          setCategories(categoriesResult.value);
          setCategoriesLoadFailed(false);
        } else {
          setCategoriesLoadFailed(true);
        }

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
          setOverview({ accounts, balances, movements, refunds, transfers });
          setPrimaryAccountId(
            ownerId ? getPrimaryAccountId(ownerId, activeAccounts) : (activeAccounts[0]?.id ?? ''),
          );
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
  }, [ownerId, refreshKey]);

  const accounts = overview?.accounts ?? [];
  const activeAccounts = accounts.filter((account) => account.archived_at === null);
  const archivedAccounts = accounts.filter((account) => account.archived_at !== null);
  const financialAccountOptions = accounts.map(({ archived_at, currency, id, name }) => ({
    archived_at,
    currency,
    id,
    name,
  }));
  const balanceByAccountId = new Map(
    (overview?.balances ?? []).map((balance) => [balance.accountId, balance]),
  );

  function refreshOverview() {
    setRefreshKey((currentKey) => currentKey + 1);
  }

  async function refreshCategories() {
    try {
      const updatedCategories = await categoryService.listCategories();
      setCategories(updatedCategories);
      setCategoriesLoadFailed(false);
      if (ownerId) {
        const cachedLookups = readOwnerLookups(ownerId);
        if (cachedLookups) {
          writeOwnerLookups(ownerId, { ...cachedLookups, categories: updatedCategories });
        }
      }
    } catch (error) {
      setCategoriesLoadFailed(true);
      throw error;
    }
  }

  function handleSetPrimaryAccount(accountId: string) {
    setPrimaryAccountId(accountId);
    if (ownerId) {
      savePrimaryAccountId(ownerId, accountId);
    }
  }

  async function handleArchiveAccount(account: FinancialAccount) {
    if (
      !window.confirm(
        `¿Eliminar ${account.name} de las cuentas habilitadas? Sus movimientos y transferencias se conservarán en el historial.`,
      )
    ) {
      return;
    }

    setAccountActionId(account.id);
    setAccountActionFailed(false);
    setPermanentDeleteMessage(null);
    try {
      await accountService.archiveAccount(account.id);
      if (ownerId && account.id === primaryAccountId) {
        const nextPrimaryAccount = activeAccounts.find((item) => item.id !== account.id);
        savePrimaryAccountId(ownerId, nextPrimaryAccount?.id ?? '');
      }
      refreshOverview();
    } catch {
      setAccountActionFailed(true);
    } finally {
      setAccountActionId(null);
    }
  }

  async function handleRestoreAccount(account: FinancialAccount) {
    setAccountActionId(account.id);
    setAccountActionFailed(false);
    setPermanentDeleteMessage(null);
    try {
      await accountService.restoreAccount(account.id);
      refreshOverview();
    } catch {
      setAccountActionFailed(true);
    } finally {
      setAccountActionId(null);
    }
  }

  async function handlePermanentlyDeleteAccount(account: FinancialAccount) {
    setAccountActionFailed(false);
    setPermanentDeleteMessage(null);
    if (!ownerId) {
      setPermanentDeleteMessage('Inicia sesión para eliminar permanentemente esta cuenta.');
      return;
    }

    setAccountActionId(account.id);
    try {
      if (await syncEngine.hasPendingAccountReference(ownerId, account.id)) {
        setPermanentDeleteMessage(
          `No se puede eliminar ${account.name}: hay movimientos pendientes de sincronización en este dispositivo.`,
        );
        return;
      }

      if (
        !window.confirm(
          `¿Eliminar permanentemente ${account.name}? Esta acción no se puede deshacer.`,
        )
      ) {
        return;
      }

      const result = await accountService.permanentlyDeleteArchivedAccount(account.id);
      if (result === 'referenced') {
        setPermanentDeleteMessage(
          `No se puede eliminar ${account.name}: conserva movimientos, transferencias o revisiones de sincronización.`,
        );
        return;
      }
      if (result === 'unavailable') {
        setPermanentDeleteMessage(
          'La cuenta archivada ya no está disponible. Actualiza la página e inténtalo de nuevo.',
        );
        return;
      }

      if (account.id === primaryAccountId) {
        const nextPrimaryAccount = activeAccounts.find((item) => item.id !== account.id);
        savePrimaryAccountId(ownerId, nextPrimaryAccount?.id ?? '');
      }
      refreshOverview();
    } catch {
      setPermanentDeleteMessage(
        'No se pudo eliminar permanentemente la cuenta. Inténtalo de nuevo.',
      );
    } finally {
      setAccountActionId(null);
    }
  }

  function clearPullGesture() {
    pullStartRef.current = null;
    pullDistanceRef.current = 0;
    setPullDistance(0);
  }

  function handleTouchStart(event: React.TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    const target = event.target;
    const beganOnControl =
      target instanceof Element &&
      target.closest('button, input, select, textarea, a, [role="dialog"]') !== null;

    if (
      !touch ||
      isLoading ||
      window.scrollY > 0 ||
      document.querySelector('dialog[open]') ||
      beganOnControl
    ) {
      clearPullGesture();
      return;
    }

    pullStartRef.current = { x: touch.clientX, y: touch.clientY };
    pullDistanceRef.current = 0;
  }

  function handleTouchMove(event: React.TouchEvent<HTMLElement>) {
    const start = pullStartRef.current;
    const touch = event.touches[0];
    if (!start || !touch || isLoading) {
      return;
    }

    const distanceY = touch.clientY - start.y;
    const distanceX = Math.abs(touch.clientX - start.x);
    if (distanceY <= 0 || distanceX > distanceY) {
      clearPullGesture();
      return;
    }

    const nextDistance = Math.min(distanceY, pullRefreshThreshold);
    pullDistanceRef.current = nextDistance;
    setPullDistance(nextDistance);
  }

  function handleTouchEnd() {
    const shouldRefresh = pullDistanceRef.current >= pullRefreshThreshold && !isLoading;
    clearPullGesture();
    if (shouldRefresh) {
      refreshOverview();
    }
  }

  return (
    <main
      aria-busy={isLoading}
      className="movement-page accounts-page"
      onTouchCancel={clearPullGesture}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onTouchStart={handleTouchStart}
    >
      <header className="movement-page__header">
        <div>
          <p className="eyebrow">Cuentas, metas y categorías</p>
          <h1>Gestión financiera</h1>
        </div>
      </header>

      <div aria-live="polite" className="page-refresh-indicator">
        {isLoading ? (
          <LoadingIndicator label="Actualizando cuentas y transferencias" />
        ) : pullDistance > 0 ? (
          <span role="status">
            {pullDistance >= pullRefreshThreshold
              ? 'Suelta para actualizar'
              : 'Desliza hacia abajo para actualizar'}
          </span>
        ) : null}
      </div>

      {hasLoadError ? (
        <div className="accounts-page__load-error">
          <FeedbackMessage tone="error">
            No se pudieron cargar las cuentas y transferencias. Inténtalo de nuevo.
          </FeedbackMessage>
        </div>
      ) : null}
      {accountActionFailed ? (
        <FeedbackMessage tone="error">
          No se pudo actualizar la cuenta. Inténtalo de nuevo.
        </FeedbackMessage>
      ) : null}
      {permanentDeleteMessage ? (
        <FeedbackMessage tone="error">{permanentDeleteMessage}</FeedbackMessage>
      ) : null}

      <div className="accounts-page__actions">
        <FinancialAccountForm onCreated={refreshOverview} />
        <TransferForm accounts={activeAccounts} onRecorded={refreshOverview} />
      </div>

      <div className="accounts-page__grid">
        <details className="management-panel accounts-panel">
          <summary className="management-panel__summary">
            <h2 id="accounts-list-heading">Cuentas habilitadas</h2>
            <span className="management-panel__count">{activeAccounts.length}</span>
            <ChevronDown aria-hidden="true" className="management-panel__chevron" size={19} />
          </summary>
          <div
            aria-labelledby="accounts-list-heading"
            className="management-panel__content"
            role="region"
          >
            {overview ? (
              activeAccounts.length > 0 ? (
                <ul className="financial-account-list" aria-label="Cuentas financieras">
                  {activeAccounts.map((account) => {
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
                        <div className="financial-account-row__actions">
                          <button
                            aria-label={
                              account.id === primaryAccountId
                                ? `${account.name} es la cuenta principal`
                                : `Establecer ${account.name} como cuenta principal`
                            }
                            aria-pressed={account.id === primaryAccountId}
                            className="financial-account-row__primary"
                            onClick={() => handleSetPrimaryAccount(account.id)}
                            type="button"
                          >
                            <Star
                              aria-hidden="true"
                              fill={account.id === primaryAccountId ? 'currentColor' : 'none'}
                              size={15}
                            />
                            {account.id === primaryAccountId ? 'Principal' : 'Hacer principal'}
                          </button>
                          <button
                            aria-label={`Eliminar ${account.name}`}
                            className="financial-account-row__archive"
                            disabled={accountActionId !== null}
                            onClick={() => void handleArchiveAccount(account)}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" size={15} />
                            Eliminar
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="accounts-panel__empty">Todavía no hay cuentas habilitadas.</p>
              )
            ) : isLoading ? (
              <FeedbackMessage tone="info">Cargando cuentas habilitadas.</FeedbackMessage>
            ) : null}

            {archivedAccounts.length > 0 ? (
              <details className="accounts-page__archived">
                <summary>Cuentas archivadas ({archivedAccounts.length})</summary>
                <ul className="financial-account-list" aria-label="Cuentas archivadas">
                  {archivedAccounts.map((account) => (
                    <li className="financial-account-row" key={account.id}>
                      <div className="financial-account-row__details">
                        <h3>{account.name}</h3>
                        <p>
                          {accountKindLabels[account.kind]} <span aria-hidden="true">·</span>{' '}
                          {account.currency}
                        </p>
                      </div>
                      <strong className="financial-account-row__balance">
                        {formatMoney(
                          balanceByAccountId.get(account.id)?.balance ?? '0',
                          account.currency,
                        )}
                      </strong>
                      <div className="financial-account-row__actions">
                        <button
                          aria-label={`Restaurar ${account.name}`}
                          disabled={accountActionId !== null}
                          onClick={() => void handleRestoreAccount(account)}
                          type="button"
                        >
                          <RotateCcw aria-hidden="true" size={15} />
                          Restaurar
                        </button>
                        <button
                          aria-label={`Eliminar permanentemente ${account.name}`}
                          className="financial-account-row__archive"
                          disabled={accountActionId !== null}
                          onClick={() => void handlePermanentlyDeleteAccount(account)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={15} />
                          Eliminar definitivamente
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </details>

        <TransferHistory accounts={accounts} transfers={overview?.transfers ?? []} />
      </div>

      <RecurringMovementsManagement
        categories={categories}
        financialAccounts={financialAccountOptions}
      />

      <SavingsGoalsSection refreshSignal={refreshKey} />

      <details className="management-panel accounts-page__summary" id="period-summary">
        <summary className="management-panel__summary">
          <h2 id="period-summary-heading">Resumen del período y categorías</h2>
          <span className="management-panel__count">{period}</span>
          <ChevronDown aria-hidden="true" className="management-panel__chevron" size={19} />
        </summary>
        <div className="management-panel__content" aria-labelledby="period-summary-heading">
          {overview ? (
            <PeriodSummary
              categories={categories}
              movements={overview.movements}
              onPeriodChange={setPeriod}
              period={period}
              refunds={overview.refunds}
            />
          ) : null}
        </div>
      </details>

      <details className="management-panel accounts-categories-panel">
        <summary className="management-panel__summary">
          <h2 id="accounts-categories-title">Categorías</h2>
          <span className="management-panel__count">
            {categories.filter((category) => category.archived_at === null).length}
          </span>
          <ChevronDown aria-hidden="true" className="management-panel__chevron" size={19} />
        </summary>
        <div className="management-panel__content">
          {categoriesLoadFailed ? (
            <FeedbackMessage tone="error">No se pudieron cargar las categorías.</FeedbackMessage>
          ) : null}
          <div className="accounts-categories-panel__actions">
            <FullPageFormDialog
              dialogLabel="Gestionar categorías"
              triggerLabel="Gestionar categorías"
            >
              {(closeDialog) => (
                <CategoryManager
                  categories={categories}
                  onCategoriesChanged={refreshCategories}
                  onClose={closeDialog}
                />
              )}
            </FullPageFormDialog>
          </div>
        </div>
      </details>
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>, closeDialog: () => void) {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    try {
      await accountService.createAccount({ name, kind, currency, openingBalance });
      setName('');
      setOpeningBalance('');
      setFeedback({ message: 'Cuenta creada.', tone: 'success' });
      onCreated();
      closeDialog();
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
    <FullPageFormDialog
      dialogLabel="Agregar cuenta"
      triggerClassName="button-primary"
      triggerLabel="Agregar cuenta"
    >
      {(closeDialog) => (
        <section className="account-editor" aria-labelledby="account-editor-heading">
          <header className="account-editor__heading">
            <h2 id="account-editor-heading">Agregar cuenta</h2>
          </header>
          <form
            aria-label="Crear cuenta financiera"
            onSubmit={(event) => void handleSubmit(event, closeDialog)}
          >
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
      )}
    </FullPageFormDialog>
  );
}
