import { ChevronDown } from 'lucide-react';
import { formatCivilDate, formatMoney } from '../../lib/money/format';
import type { FinancialAccount } from './accountService';
import type { Transfer } from './transferService';

type TransferHistoryProps = {
  accounts: FinancialAccount[];
  transfers: Transfer[];
};

export function TransferHistory({ accounts, transfers }: TransferHistoryProps) {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]));
  const accountCurrencies = new Map(accounts.map((account) => [account.id, account.currency]));

  return (
    <details className="management-panel transfer-history">
      <summary className="management-panel__summary">
        <h2 id="transfer-history-heading">Historial de transferencias</h2>
        <span className="management-panel__count">{transfers.length}</span>
        <ChevronDown aria-hidden="true" className="management-panel__chevron" size={19} />
      </summary>
      <div className="management-panel__content">
        {transfers.length > 0 ? (
          <ul className="transfer-history__list" aria-label="Historial de transferencias">
            {transfers.map((transfer) => {
              const currency = accountCurrencies.get(transfer.source_account_id) ?? 'ARS';
              return (
                <li className="transfer-row" key={transfer.id}>
                  <div className="transfer-row__details">
                    <strong>
                      {accountNames.get(transfer.source_account_id) ?? 'Cuenta de origen'}
                      <span aria-hidden="true"> → </span>
                      {accountNames.get(transfer.destination_account_id) ?? 'Cuenta de destino'}
                    </strong>
                    <time dateTime={transfer.occurred_on}>
                      {formatCivilDate(transfer.occurred_on)}
                    </time>
                  </div>
                  <strong className="transfer-row__amount">
                    {formatMoney(transfer.amount, currency)}
                  </strong>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="transfer-history__empty">Todavía no hay transferencias.</p>
        )}
      </div>
    </details>
  );
}
