import { useRef, useState } from 'react';
import type { FinancialAccount } from './accountService';
import { transferService } from './transferService';

type TransferFormProps = {
  accounts: FinancialAccount[];
  onRecorded: () => void;
};

export function TransferForm({ accounts, onRecorded }: TransferFormProps) {
  const operationId = useRef(crypto.randomUUID());
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(getTodayCivilDate);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sourceAccount = accounts.find((account) => account.id === sourceAccountId);
  const availableDestinations = accounts.filter(
    (account) =>
      account.id !== sourceAccountId &&
      (!sourceAccount || account.currency === sourceAccount.currency),
  );

  function updateOperationId() {
    operationId.current = crypto.randomUUID();
    setError('');
    setSuccess('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const destinationAccount = accounts.find((account) => account.id === destinationAccountId);
    if (!sourceAccount || !destinationAccount) {
      setError('Selecciona las cuentas de origen y destino.');
      return;
    }
    if (sourceAccount.id === destinationAccount.id) {
      setError('El origen y el destino deben ser cuentas distintas.');
      return;
    }
    if (sourceAccount.currency !== destinationAccount.currency) {
      setError('Las cuentas deben usar la misma moneda.');
      return;
    }

    setIsSubmitting(true);
    try {
      await transferService.recordTransfer({
        amount,
        destinationAccountId,
        occurredOn,
        operationId: operationId.current,
        sourceAccountId,
      });
      setAmount('');
      setSuccess('Transferencia registrada.');
      operationId.current = crypto.randomUUID();
      onRecorded();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error && caughtError.name === 'TransferInputError'
          ? caughtError.message
          : 'No se pudo registrar la transferencia. Verifica las cuentas e inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="transfer-editor" aria-labelledby="transfer-editor-heading">
      <header className="transfer-editor__heading">
        <div>
          <p className="eyebrow">Entre cuentas propias</p>
          <h2 id="transfer-editor-heading">Registrar transferencia</h2>
        </div>
      </header>
      <form aria-label="Registrar transferencia" onSubmit={(event) => void handleSubmit(event)}>
        <label htmlFor="transfer-source">Cuenta de origen</label>
        <select
          id="transfer-source"
          onChange={(event) => {
            updateOperationId();
            setSourceAccountId(event.target.value);
            setDestinationAccountId('');
          }}
          required
          value={sourceAccountId}
        >
          <option value="">Selecciona una cuenta</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <label htmlFor="transfer-destination">Cuenta de destino</label>
        <select
          id="transfer-destination"
          onChange={(event) => {
            updateOperationId();
            setDestinationAccountId(event.target.value);
          }}
          required
          value={destinationAccountId}
        >
          <option value="">Selecciona una cuenta</option>
          {availableDestinations.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <label htmlFor="transfer-amount">Importe</label>
        <input
          autoComplete="off"
          id="transfer-amount"
          inputMode="decimal"
          onChange={(event) => {
            updateOperationId();
            setAmount(event.target.value);
          }}
          required
          value={amount}
        />
        <p className="transfer-editor__currency">
          Moneda: <strong>{sourceAccount?.currency ?? '—'}</strong>
        </p>

        <label htmlFor="transfer-date">Fecha</label>
        <input
          id="transfer-date"
          onChange={(event) => {
            updateOperationId();
            setOccurredOn(event.target.value);
          }}
          required
          type="date"
          value={occurredOn}
        />

        {error ? (
          <p className="transfer-editor__feedback transfer-editor__feedback--error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="transfer-editor__feedback transfer-editor__feedback--success" role="status">
            {success}
          </p>
        ) : null}
        <button
          className="button-primary"
          disabled={isSubmitting || accounts.length < 2}
          type="submit"
        >
          Registrar transferencia
        </button>
      </form>
    </section>
  );
}

function getTodayCivilDate(): string {
  const today = new Date();
  const year = String(today.getFullYear()).padStart(4, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
