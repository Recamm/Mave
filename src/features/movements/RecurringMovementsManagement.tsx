import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { MovementForm } from './MovementForm';
import { RecurringMovementsPanel } from './RecurringMovementsPanel';
import {
  recurringMovementService,
  type RecurringMovement,
  type RecurringMovementInput,
  type RecurringMovementPayment,
} from './recurringMovementService';
import type { Category } from '../categories/categoryService';
import type { FinancialAccountOption } from './movementService';
import type { MovementInput } from './movementInput';
import type { RecurrenceSettings } from './recurrence';
import { getCivilDateInTimeZone, getOccurrenceDate } from './recurrence';

type RecurringMovementsManagementProps = {
  categories: Category[];
  financialAccounts: FinancialAccountOption[];
};

export function RecurringMovementsManagement({
  categories,
  financialAccounts,
}: RecurringMovementsManagementProps) {
  const [movements, setMovements] = useState<RecurringMovement[]>([]);
  const [payments, setPayments] = useState<RecurringMovementPayment[]>([]);
  const [editingMovement, setEditingMovement] = useState<RecurringMovement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    let isCurrent = true;

    void Promise.all([recurringMovementService.list(), recurringMovementService.listPayments()])
      .then(([loadedMovements, loadedPayments]) => {
        if (isCurrent) {
          setMovements(loadedMovements);
          setPayments(loadedPayments);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (editingMovement && dialog && !dialog.open) {
      dialog.showModal();
    } else if (!editingMovement && dialog?.open) {
      dialog.close();
    }
  }, [editingMovement]);

  async function handleMarkPaid(movement: RecurringMovement): Promise<void> {
    await recurringMovementService.markPaid(
      movement.id,
      movement.occurrence_index,
      getCivilDateInTimeZone(movement.time_zone),
      crypto.randomUUID(),
    );
    setMovements((current) =>
      current.map((item) => {
        if (item.id !== movement.id) {
          return item;
        }

        const nextOccurrenceIndex = item.occurrence_index + 1;
        return {
          ...item,
          last_notified_on: null,
          nextDueOn: getOccurrenceDate(
            item.starts_on,
            nextOccurrenceIndex,
            item.interval_count,
            item.interval_unit,
          ),
          occurrence_index: nextOccurrenceIndex,
        };
      }),
    );
  }

  async function handleSave(
    input: MovementInput,
    recurrence?: RecurrenceSettings,
    recurringMovementId?: string,
  ): Promise<void> {
    if (!editingMovement || !recurrence || recurringMovementId !== editingMovement.id) {
      throw new Error(
        'La recurrencia no está disponible. Actualiza la página e inténtalo de nuevo.',
      );
    }

    const updated = await recurringMovementService.update(
      recurringMovementId,
      toRecurringMovementInput(input, recurrence, editingMovement.time_zone),
    );
    setMovements((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingMovement(null);
  }

  async function handleSetActive(id: string, active: boolean): Promise<void> {
    const updated = await recurringMovementService.setActive(id, active);
    setMovements((current) => current.map((item) => (item.id === id ? updated : item)));
  }

  async function handleSetReminderEnabled(id: string, reminderEnabled: boolean): Promise<void> {
    const updated = await recurringMovementService.setReminderEnabled(id, reminderEnabled);
    setMovements((current) => current.map((item) => (item.id === id ? updated : item)));
  }

  async function handleDelete(movement: RecurringMovement): Promise<void> {
    if (
      !window.confirm(
        '¿Eliminar esta recurrencia? Los movimientos ya pagados o cobrados se conservarán en el historial.',
      )
    ) {
      return;
    }

    await recurringMovementService.delete(movement.id);
    setMovements((current) => current.filter((item) => item.id !== movement.id));
  }

  async function handleUndoPayment(payment: RecurringMovementPayment): Promise<void> {
    const transactionLabel =
      movements.find((item) => item.id === payment.recurring_movement_id)?.kind === 'income'
        ? 'cobro'
        : 'pago';
    if (
      !window.confirm(
        `¿Deshacer este ${transactionLabel} recurrente? Se quitará del historial y se reabrirá si era el último pago.`,
      )
    ) {
      return;
    }

    await recurringMovementService.undoPayment(payment.movement_id, crypto.randomUUID());
    setPayments((current) => current.filter((item) => item.movement_id !== payment.movement_id));
    setMovements((current) =>
      current.map((item) => {
        if (
          item.id !== payment.recurring_movement_id ||
          item.occurrence_index !== payment.occurrence_index + 1
        ) {
          return item;
        }

        return {
          ...item,
          last_notified_on: null,
          nextDueOn: getOccurrenceDate(
            item.starts_on,
            payment.occurrence_index,
            item.interval_count,
            item.interval_unit,
          ),
          occurrence_index: payment.occurrence_index,
        };
      }),
    );
    void recurringMovementService
      .list()
      .then(setMovements)
      .catch(() => undefined);
  }

  function closeDialog() {
    setEditingMovement(null);
  }

  return (
    <>
      <RecurringMovementsPanel
        categories={categories}
        isLoading={isLoading}
        loadFailed={loadFailed}
        mode="management"
        movements={movements}
        payments={payments}
        onDelete={handleDelete}
        onEdit={setEditingMovement}
        onMarkPaid={handleMarkPaid}
        onSetActive={handleSetActive}
        onSetReminderEnabled={handleSetReminderEnabled}
        onUndoPayment={handleUndoPayment}
      />

      {editingMovement ? (
        <dialog
          aria-labelledby="movement-form-title"
          className="movement-dialog"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          ref={dialogRef}
        >
          <button
            aria-label="Cerrar formulario"
            autoFocus
            className="movement-dialog__close"
            onClick={closeDialog}
            title="Cerrar formulario"
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
          <MovementForm
            categories={categories}
            financialAccounts={financialAccounts}
            key={editingMovement.id}
            onCancel={closeDialog}
            onSave={handleSave}
            recurringMovement={editingMovement}
          />
        </dialog>
      ) : null}
    </>
  );
}

function toRecurringMovementInput(
  input: MovementInput,
  recurrence: RecurrenceSettings,
  timeZone: string,
): RecurringMovementInput {
  return {
    ...input,
    intervalCount: recurrence.intervalCount,
    intervalUnit: recurrence.intervalUnit,
    reminderDaysBefore: recurrence.reminderDaysBefore,
    reminderEnabled: recurrence.reminderEnabled,
    reminderEveryDays: recurrence.reminderEveryDays,
    timeZone,
  };
}
