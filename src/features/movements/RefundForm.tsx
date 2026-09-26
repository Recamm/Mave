import { useRef, useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { parseDecimal, serializeDecimal } from '../../lib/money/decimal';
import { createMovementDefaults } from './movementInput';
import { refundService, type Refund, type RefundOperation } from './refundService';
import type { Movement } from './movementService';

type RefundFormProps = {
  expense: Movement;
  refund?: Refund | null;
  categoryName: string;
  accountName: string | null;
  onCancel: () => void;
  onSaved: () => Promise<void>;
};

export function RefundForm({
  expense,
  refund,
  categoryName,
  accountName,
  onCancel,
  onSaved,
}: RefundFormProps) {
  const [amount, setAmount] = useState(refund?.amount ?? '');
  const [receivedOn, setReceivedOn] = useState(
    refund?.received_on ?? createMovementDefaults().occurredOn,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const operationAttempt = useRef<{ signature: string; operationId: string } | null>(null);
  const formTitle = refund ? 'Editar devolución' : 'Registrar devolución';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const parsedAmount = parseDecimal(amount);
      if (!parsedAmount.gt('0')) {
        throw new Error('invalid-amount');
      }

      const operation: Omit<RefundOperation, 'operationId'> = {
        action: refund ? 'update' : 'create',
        refundId: refund?.id ?? null,
        expenseId: refund ? null : expense.id,
        amount: serializeDecimal(parsedAmount),
        receivedOn,
        expectedVersion: refund?.version ?? null,
      };
      const signature = JSON.stringify(operation);
      const operationId =
        operationAttempt.current?.signature === signature
          ? operationAttempt.current.operationId
          : crypto.randomUUID();
      operationAttempt.current = { signature, operationId };

      await refundService.recordRefund({ ...operation, operationId });
      await onSaved();
    } catch {
      setErrorMessage(
        'No se pudo guardar la devolución. Verifica el importe pendiente e inténtalo de nuevo.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form aria-label={formTitle} className="refund-form" onSubmit={handleSubmit}>
      <h3>{formTitle}</h3>
      <dl className="refund-form__inherited">
        <div>
          <dt>Moneda</dt>
          <dd>{expense.currency}</dd>
        </div>
        <div>
          <dt>Categoría</dt>
          <dd>{categoryName}</dd>
        </div>
        <div>
          <dt>Cuenta acreditada</dt>
          <dd>{accountName ?? 'Sin cuenta asociada'}</dd>
        </div>
      </dl>

      <label htmlFor="refund-amount">Importe de devolución</label>
      <input
        id="refund-amount"
        inputMode="decimal"
        onChange={(event) => setAmount(event.target.value)}
        placeholder="0.00"
        required
        type="text"
        value={amount}
      />

      <label htmlFor="refund-received-on">Fecha de recepción</label>
      <input
        id="refund-received-on"
        onChange={(event) => setReceivedOn(event.target.value)}
        required
        type="date"
        value={receivedOn}
      />

      {errorMessage ? <FeedbackMessage tone="error">{errorMessage}</FeedbackMessage> : null}

      <div className="refund-form__actions">
        <button className="button-primary" disabled={isSaving} type="submit">
          {isSaving ? 'Guardando…' : refund ? 'Guardar devolución' : 'Registrar devolución'}
        </button>
        <button disabled={isSaving} onClick={onCancel} type="button">
          Cancelar
        </button>
      </div>
    </form>
  );
}
