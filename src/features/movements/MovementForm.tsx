import { useState, type FormEvent } from 'react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { WebLoginPushSettings } from '../auth/WebLoginPushSettings';
import type { Category } from '../categories/categoryService';
import {
  createMovementDefaults,
  MovementInputError,
  normalizeMovementInput,
  type MovementDraft,
  type MovementInput,
} from './movementInput';
import {
  createRecurrenceDraft,
  normalizeRecurrenceSettings,
  RecurrenceInputError,
  type RecurrenceDraft,
  type RecurrenceSettings,
} from './recurrence';
import type { FinancialAccount } from '../accounts/accountService';
import type { FinancialAccountOption, Movement } from './movementService';

type MovementFormProps = {
  categories: Category[];
  defaultAccount?: FinancialAccount | null;
  financialAccounts: FinancialAccountOption[];
  movement?: Movement | null;
  onCancel: () => void;
  onSave: (input: MovementInput, recurrence?: RecurrenceSettings) => Promise<void>;
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
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceDraft, setRecurrenceDraft] = useState(createRecurrenceDraft);
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

  function updateRecurrenceDraft<Key extends keyof RecurrenceDraft>(
    key: Key,
    value: RecurrenceDraft[Key],
  ) {
    setRecurrenceDraft((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await onSave(
        normalizeMovementInput(draft),
        isRecurring ? normalizeRecurrenceSettings(recurrenceDraft) : undefined,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof MovementInputError || error instanceof RecurrenceInputError
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
        <p className="eyebrow">
          {movement ? 'Editar registro' : isRecurring ? 'Nueva recurrencia' : 'Nuevo registro'}
        </p>
        <h2 id="movement-form-title">
          {movement
            ? 'Editar movimiento'
            : isRecurring
              ? 'Crear movimiento recurrente'
              : 'Registrar un movimiento'}
        </h2>
      </div>

      <form className="movement-form" onSubmit={handleSubmit}>
        {!movement ? (
          <fieldset className="movement-form__frequency">
            <legend>Frecuencia</legend>
            <div className="movement-form__frequency-options">
              <label className={!isRecurring ? 'is-selected' : ''}>
                <input
                  checked={!isRecurring}
                  name="movement-frequency-mode"
                  onChange={() => setIsRecurring(false)}
                  type="radio"
                  value="once"
                />
                <span>Una vez</span>
              </label>
              <label className={isRecurring ? 'is-selected' : ''}>
                <input
                  checked={isRecurring}
                  name="movement-frequency-mode"
                  onChange={() => setIsRecurring(true)}
                  type="radio"
                  value="recurring"
                />
                <span>Recurrente</span>
              </label>
            </div>
          </fieldset>
        ) : null}

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

        <label htmlFor="movement-date">{isRecurring ? 'Primer vencimiento' : 'Fecha'}</label>
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

        {isRecurring ? (
          <fieldset className="movement-form__recurrence-settings">
            <legend>Repetición y avisos</legend>
            <label htmlFor="recurrence-interval-count">Se repite cada</label>
            <div className="movement-form__interval-control">
              <input
                id="recurrence-interval-count"
                max={365}
                min={1}
                onChange={(event) => updateRecurrenceDraft('intervalCount', event.target.value)}
                required
                type="number"
                value={recurrenceDraft.intervalCount}
              />
              <select
                aria-label="Unidad de frecuencia"
                onChange={(event) => updateRecurrenceDraft('intervalUnit', event.target.value)}
                value={recurrenceDraft.intervalUnit}
              >
                <option value="day">día</option>
                <option value="week">semana</option>
                <option value="month">mes</option>
                <option value="year">año</option>
              </select>
            </div>

            <label className="movement-form__checkbox" htmlFor="recurrence-reminder-enabled">
              <input
                checked={recurrenceDraft.reminderEnabled}
                id="recurrence-reminder-enabled"
                onChange={(event) => updateRecurrenceDraft('reminderEnabled', event.target.checked)}
                type="checkbox"
              />
              <span>Activar avisos</span>
            </label>

            {recurrenceDraft.reminderEnabled ? (
              <>
                <label htmlFor="recurrence-reminder-days-before">Avisar con cuántos días</label>
                <input
                  id="recurrence-reminder-days-before"
                  max={365}
                  min={0}
                  onChange={(event) =>
                    updateRecurrenceDraft('reminderDaysBefore', event.target.value)
                  }
                  required
                  type="number"
                  value={recurrenceDraft.reminderDaysBefore}
                />

                <label htmlFor="recurrence-reminder-every-days">
                  Repetir aviso cada cuántos días
                </label>
                <input
                  id="recurrence-reminder-every-days"
                  max={365}
                  min={1}
                  onChange={(event) =>
                    updateRecurrenceDraft('reminderEveryDays', event.target.value)
                  }
                  required
                  type="number"
                  value={recurrenceDraft.reminderEveryDays}
                />

                <WebLoginPushSettings />
              </>
            ) : null}
          </fieldset>
        ) : null}

        {errorMessage ? (
          <div className="movement-form__feedback">
            <FeedbackMessage tone="error">{errorMessage}</FeedbackMessage>
          </div>
        ) : null}

        <div className="movement-form__actions">
          <button className="button-primary" disabled={isSaving} type="submit">
            {isSaving
              ? 'Guardando…'
              : movement
                ? 'Guardar cambios'
                : isRecurring
                  ? 'Crear recurrencia'
                  : 'Registrar movimiento'}
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
