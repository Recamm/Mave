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
  getReminderFrequency,
  getReminderLeadLabel,
  normalizeRecurrenceSettings,
  reminderLeadOptions,
  RecurrenceInputError,
  type RecurrenceDraft,
  type RecurrenceSettings,
} from './recurrence';
import type { FinancialAccount } from '../accounts/accountService';
import type { FinancialAccountOption, Movement } from './movementService';
import type { RecurringMovement } from './recurringMovementService';

type MovementFormProps = {
  categories: Category[];
  defaultAccount?: FinancialAccount | null;
  financialAccounts: FinancialAccountOption[];
  movement?: Movement | null;
  recurringMovement?: RecurringMovement | null;
  onCancel: () => void;
  onSave: (
    input: MovementInput,
    recurrence?: RecurrenceSettings,
    recurringMovementId?: string,
  ) => Promise<void>;
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

function toRecurringMovementDraft(movement: RecurringMovement): MovementDraft {
  return {
    amount: movement.amount,
    categoryId: movement.category_id,
    currency: movement.currency,
    financialAccountId: movement.financial_account_id ?? '',
    kind: movement.kind,
    note: movement.note ?? '',
    occurredOn: movement.starts_on,
  };
}

function toRecurrenceDraft(movement: RecurringMovement): RecurrenceDraft {
  return {
    intervalCount: String(movement.interval_count),
    intervalUnit: movement.interval_unit,
    reminderDaysBefore: String(movement.reminder_days_before),
    reminderEnabled: movement.reminder_enabled,
    reminderEveryDays: String(movement.reminder_every_days),
    reminderFrequency: getReminderFrequency(
      movement.reminder_days_before,
      movement.reminder_every_days,
    ),
  };
}

export function MovementForm({
  categories,
  defaultAccount = null,
  financialAccounts,
  movement,
  recurringMovement,
  onCancel,
  onSave,
}: MovementFormProps) {
  const [draft, setDraft] = useState(() => {
    if (movement) {
      return toDraft(movement);
    }
    if (recurringMovement) {
      return toRecurringMovementDraft(recurringMovement);
    }

    const defaults = createMovementDefaults();
    return {
      ...defaults,
      currency: defaultAccount?.currency ?? defaults.currency,
      financialAccountId: defaultAccount?.id ?? defaults.financialAccountId,
    };
  });
  const [isRecurring, setIsRecurring] = useState(
    () => recurringMovement !== null && recurringMovement !== undefined,
  );
  const [recurrenceDraft, setRecurrenceDraft] = useState(() =>
    recurringMovement ? toRecurrenceDraft(recurringMovement) : createRecurrenceDraft(),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentCategoryId = movement?.category_id ?? recurringMovement?.category_id;
  const currentAccountId =
    movement?.financial_account_id ?? recurringMovement?.financial_account_id;
  const archivedCategory = categories.find(
    (category) => category.id === currentCategoryId && category.archived_at !== null,
  );
  const selectableCategories = categories.filter(
    (category) => category.archived_at === null || category.id === currentCategoryId,
  );
  const selectableAccounts = financialAccounts.filter(
    (account) =>
      account.currency === draft.currency &&
      (account.archived_at === null || account.id === currentAccountId),
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
        recurringMovement?.id,
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
          {movement
            ? 'Editar registro'
            : recurringMovement
              ? 'Editar recurrencia'
              : isRecurring
                ? 'Nueva recurrencia'
                : 'Nuevo registro'}
        </p>
        <h2 id="movement-form-title">
          {movement
            ? 'Editar movimiento'
            : recurringMovement
              ? 'Editar movimiento recurrente'
              : isRecurring
                ? 'Crear movimiento recurrente'
                : 'Registrar un movimiento'}
        </h2>
      </div>

      <form className="movement-form" onSubmit={handleSubmit}>
        {!movement && !recurringMovement ? (
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
                <label htmlFor="recurrence-reminder-days-before">Avisar antes</label>
                <select
                  id="recurrence-reminder-days-before"
                  onChange={(event) =>
                    updateRecurrenceDraft('reminderDaysBefore', event.target.value)
                  }
                  required
                  value={recurrenceDraft.reminderDaysBefore}
                >
                  {reminderLeadOptions.map((option) => (
                    <option key={option.days} value={option.days}>
                      {option.label}
                    </option>
                  ))}
                  {!reminderLeadOptions.some(
                    (option) => String(option.days) === recurrenceDraft.reminderDaysBefore,
                  ) ? (
                    <option value={recurrenceDraft.reminderDaysBefore}>
                      {getReminderLeadLabel(Number(recurrenceDraft.reminderDaysBefore))}{' '}
                      (configuración anterior)
                    </option>
                  ) : null}
                </select>

                <fieldset className="movement-form__reminder-frequency">
                  <legend>Frecuencia del aviso</legend>
                  <div className="movement-form__frequency-options">
                    <label
                      className={recurrenceDraft.reminderFrequency === 'once' ? 'is-selected' : ''}
                    >
                      <input
                        checked={recurrenceDraft.reminderFrequency === 'once'}
                        name="recurrence-reminder-frequency"
                        onChange={() => updateRecurrenceDraft('reminderFrequency', 'once')}
                        type="radio"
                        value="once"
                      />
                      <span>Una vez, al iniciar el plazo</span>
                    </label>
                    <label
                      className={recurrenceDraft.reminderFrequency === 'daily' ? 'is-selected' : ''}
                    >
                      <input
                        checked={recurrenceDraft.reminderFrequency === 'daily'}
                        name="recurrence-reminder-frequency"
                        onChange={() => updateRecurrenceDraft('reminderFrequency', 'daily')}
                        type="radio"
                        value="daily"
                      />
                      <span>Cada día hasta el vencimiento</span>
                    </label>
                    {recurrenceDraft.reminderFrequency === 'custom' ? (
                      <label className="is-selected">
                        <input
                          checked
                          name="recurrence-reminder-frequency"
                          onChange={() => updateRecurrenceDraft('reminderFrequency', 'custom')}
                          type="radio"
                          value="custom"
                        />
                        <span>
                          Conservar cada {recurrenceDraft.reminderEveryDays} días (configuración
                          anterior)
                        </span>
                      </label>
                    ) : null}
                  </div>
                </fieldset>

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
                : recurringMovement
                  ? 'Guardar recurrencia'
                  : isRecurring
                    ? 'Crear recurrencia'
                    : 'Registrar movimiento'}
          </button>
          {movement || recurringMovement ? (
            <button disabled={isSaving} onClick={onCancel} type="button">
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
