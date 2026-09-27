import { useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import type { Category } from '../categories/categoryService';
import {
  createMovementDefaults,
  MovementInputError,
  normalizeMovementInput,
  type MovementDraft,
  type MovementInput,
} from './movementInput';
import type { FinancialAccount } from '../accounts/accountService';
import type { FinancialAccountOption, Movement } from './movementService';

type MovementFormProps = {
  categories: Category[];
  defaultAccount?: FinancialAccount | null;
  financialAccounts: FinancialAccountOption[];
  movement?: Movement | null;
  onCancel: () => void;
  onSave: (input: MovementInput) => Promise<void>;
};

function toDraft(movement: Movement): MovementDraft {
  return {
    amount: movement.amount,
    categoryId: movement.category_id,
    currency: movement.currency,
    financialAccountId: movement.financial_account_id ?? '',
    kind: movement.kind,
    note: movement.note ?? '',
    occurredOn: movement.occurred_on,
  };
}

export function MovementForm({
  categories,
  defaultAccount = null,
  financialAccounts,
  movement,
  onCancel,
  onSave,
}: MovementFormProps) {
  const [draft, setDraft] = useState(() => {
    if (movement) {
      return toDraft(movement);
    }

    const defaults = createMovementDefaults();
    return {
      ...defaults,
      currency: defaultAccount?.currency ?? defaults.currency,
      financialAccountId: defaultAccount?.id ?? defaults.financialAccountId,
    };
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const archivedCategory = categories.find(
    (category) => category.id === movement?.category_id && category.archived_at !== null,
  );
  const selectableCategories = categories.filter(
    (category) => category.archived_at === null || category.id === movement?.category_id,
  );
  const selectableAccounts = financialAccounts.filter(
    (account) =>
      account.currency === draft.currency &&
      (account.archived_at === null || account.id === movement?.financial_account_id),
  );

  function updateDraft<Key extends keyof MovementDraft>(key: Key, value: MovementDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(normalizeMovementInput(draft));
    } catch (error) {
      setErrorMessage(
        error instanceof MovementInputError
          ? error.message
          : 'No se pudo guardar el movimiento. Inténtalo de nuevo.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section aria-labelledby="movement-form-title" className="movement-editor">
      <div className="movement-editor__heading">
        <p className="eyebrow">{movement ? 'Editar registro' : 'Nuevo registro'}</p>
        <h2 id="movement-form-title">
          {movement ? 'Editar movimiento' : 'Registrar un movimiento'}
        </h2>
      </div>

      <form className="movement-form" onSubmit={handleSubmit}>
        <label htmlFor="movement-kind">Tipo</label>
        <select
          id="movement-kind"
          onChange={(event) => updateDraft('kind', event.target.value)}
          required
          value={draft.kind}
        >
          <option value="expense">Gasto</option>
          <option value="income">Ingreso</option>
        </select>

        <label htmlFor="movement-amount">Importe</label>
        <input
          autoComplete="off"
          id="movement-amount"
          inputMode="decimal"
          onChange={(event) => updateDraft('amount', event.target.value)}
          placeholder="0.00"
          required
          type="text"
          value={draft.amount}
        />

        <label htmlFor="movement-currency">Moneda</label>
        <select
          id="movement-currency"
          onChange={(event) => {
            updateDraft('currency', event.target.value);
            updateDraft('financialAccountId', '');
          }}
          required
          value={draft.currency}
        >
          <option value="ARS">ARS</option>
          <option value="USD">USD</option>
        </select>

        <label htmlFor="movement-date">Fecha</label>
        <input
          id="movement-date"
          onChange={(event) => updateDraft('occurredOn', event.target.value)}
          required
          type="date"
          value={draft.occurredOn}
        />

        <label htmlFor="movement-category">Categoría</label>
        <select
          id="movement-category"
          onChange={(event) => updateDraft('categoryId', event.target.value)}
          required
          value={draft.categoryId}
        >
          <option disabled value="">
            Elegir categoría
          </option>
          {selectableCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.id === archivedCategory?.id ? ' (archivada)' : ''}
            </option>
          ))}
        </select>

        <label htmlFor="movement-account">Cuenta (opcional)</label>
        <select
          id="movement-account"
          onChange={(event) => updateDraft('financialAccountId', event.target.value)}
          value={draft.financialAccountId}
        >
          <option value="">Sin cuenta</option>
          {selectableAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </select>

        <label htmlFor="movement-note">Nota (opcional)</label>
        <textarea
          id="movement-note"
          maxLength={2000}
          onChange={(event) => updateDraft('note', event.target.value)}
          rows={3}
          value={draft.note}
        />

        {errorMessage ? (
          <div className="movement-form__feedback">
            <FeedbackMessage tone="error">{errorMessage}</FeedbackMessage>
          </div>
        ) : null}

        <div className="movement-form__actions">
          <button className="button-primary" disabled={isSaving} type="submit">
            {isSaving ? 'Guardando…' : movement ? 'Guardar cambios' : 'Registrar movimiento'}
          </button>
          {movement ? (
            <button disabled={isSaving} onClick={onCancel} type="button">
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
