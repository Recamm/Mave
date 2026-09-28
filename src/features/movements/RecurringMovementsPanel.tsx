import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, CheckCircle2, Pause, Pencil, Play, Trash2, Undo2 } from 'lucide-react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { formatCivilDate, formatMoney } from '../../lib/money/format';
import type { Category } from '../categories/categoryService';
import type { RecurringMovement, RecurringMovementPayment } from './recurringMovementService';
import { getReminderFrequency, getReminderLeadLabel, isRecurringMovementDue } from './recurrence';

export type RecurringMovementsMode = 'management' | 'pending';

type RecurringMovementsPanelProps = {
  categories: Category[];
  isLoading: boolean;
  loadFailed: boolean;
  mode: RecurringMovementsMode;
  movements: RecurringMovement[];
  payments?: RecurringMovementPayment[];
  onMarkPaid: (movement: RecurringMovement) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
  onSetReminderEnabled: (id: string, reminderEnabled: boolean) => Promise<void>;
  onUndoPayment?: (payment: RecurringMovementPayment) => Promise<void>;
  onEdit?: (movement: RecurringMovement) => void;
  onDelete?: (movement: RecurringMovement) => void | Promise<void>;
};

const intervalLabels: Record<RecurringMovement['interval_unit'], [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
};

export function RecurringMovementsPanel({
  categories,
  isLoading,
  loadFailed,
  mode,
  movements,
  payments = [],
  onMarkPaid,
  onSetActive,
  onSetReminderEnabled,
  onUndoPayment,
  onEdit,
  onDelete,
}: RecurringMovementsPanelProps) {
  const { search } = useLocation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentInstant, setCurrentInstant] = useState(() => new Date());
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine,
  );
  const recurringId = new URLSearchParams(search).get('recurringId');

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const refreshCurrentInstant = () => setCurrentInstant(new Date());
    const intervalId = window.setInterval(refreshCurrentInstant, 60_000);
    window.addEventListener('focus', refreshCurrentInstant);
    document.addEventListener('visibilitychange', refreshCurrentInstant);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshCurrentInstant);
      document.removeEventListener('visibilitychange', refreshCurrentInstant);
    };
  }, []);

  useEffect(() => {
    if (!recurringId) {
      return;
    }
    document
      .getElementById(`recurring-${recurringId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [movements, recurringId]);

  const visibleMovements =
    mode === 'pending'
      ? movements.filter((movement) => {
          if (!movement.active) {
            return false;
          }

          const previousOccurrenceWasPaid = payments.some(
            (payment) =>
              payment.recurring_movement_id === movement.id &&
              payment.occurrence_index === movement.occurrence_index - 1,
          );

          return (
            !previousOccurrenceWasPaid ||
            isRecurringMovementDue(movement.nextDueOn, movement.time_zone, currentInstant)
          );
        })
      : movements;

  async function runAction(id: string, action: () => Promise<void>) {
    setPendingId(id);
    setErrorMessage(null);
    try {
      await action();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'No se pudo actualizar el movimiento recurrente. Inténtalo de nuevo.',
      );
    } finally {
      setPendingId(null);
    }
  }

  if (mode === 'pending' && visibleMovements.length === 0 && !loadFailed) {
    return null;
  }

  return (
    <section aria-labelledby="recurring-movements-title" className="recurring-movements">
      <div className="recurring-movements__heading">
        <div>
          <p className="eyebrow">{mode === 'pending' ? 'Pendientes' : 'Agenda'}</p>
          <h2 id="recurring-movements-title">
            {mode === 'pending' ? 'Pagos y cobros pendientes' : 'Pagos y cobros recurrentes'}
          </h2>
        </div>
        {mode === 'management' && movements.some((movement) => movement.reminder_enabled) ? (
          <Link to="/profile?section=security">Notificaciones</Link>
        ) : null}
      </div>

      {loadFailed ? (
        <FeedbackMessage tone="error">
          No se pudieron cargar los movimientos recurrentes. Comprueba la conexión e inténtalo de
          nuevo.
        </FeedbackMessage>
      ) : null}
      {errorMessage ? <FeedbackMessage tone="error">{errorMessage}</FeedbackMessage> : null}
      {!isOnline ? (
        <FeedbackMessage tone="info">
          Conéctate para registrar pagos o cambiar las opciones de recurrencia.
        </FeedbackMessage>
      ) : null}

      {isLoading ? (
        <FeedbackMessage tone="info">Cargando movimientos recurrentes.</FeedbackMessage>
      ) : null}
      {visibleMovements.length === 0 && mode === 'management' && !loadFailed && !isLoading ? (
        <p className="recurring-movements__empty">No hay pagos ni cobros recurrentes.</p>
      ) : null}

      <div className="recurring-movements__list">
        {visibleMovements.map((movement) => {
          const category = categories.find((item) => item.id === movement.category_id);
          const label = movement.note?.trim() || category?.name || 'Movimiento recurrente';
          const [singular, plural] = intervalLabels[movement.interval_unit];
          const intervalLabel = movement.interval_count === 1 ? singular : plural;
          const reminderFrequency = getReminderFrequency(
            movement.reminder_days_before,
            movement.reminder_every_days,
          );
          const reminderLead = getReminderLeadLabel(movement.reminder_days_before);
          const previousOccurrencePayment = payments.find(
            (payment) =>
              payment.recurring_movement_id === movement.id &&
              payment.occurrence_index === movement.occurrence_index - 1,
          );
          const isDue = isRecurringMovementDue(
            movement.nextDueOn,
            movement.time_zone,
            currentInstant,
          );
          const isPending = pendingId === movement.id;
          const transactionVerb = movement.kind === 'expense' ? 'pagado' : 'cobrado';

          return (
            <article
              aria-label={label}
              className={`recurring-movement${movement.active ? '' : ' recurring-movement--paused'}`}
              id={`recurring-${movement.id}`}
              key={movement.id}
            >
              <div className="recurring-movement__details">
                <p className="eyebrow">
                  {movement.active ? 'Activo' : 'Pausado'}
                  {' · '}
                  {movement.kind === 'expense' ? 'Gasto' : 'Ingreso'}
                </p>
                <h3>{label}</h3>
                <strong>{formatMoney(movement.amount, movement.currency)}</strong>
                <p>
                  Próximo vencimiento:{' '}
                  <time dateTime={movement.nextDueOn}>{formatCivilDate(movement.nextDueOn)}</time>
                </p>
                {movement.active && !isDue ? (
                  <p>
                    Podrás marcarlo {transactionVerb} el {formatCivilDate(movement.nextDueOn)}.
                  </p>
                ) : null}
                <p>
                  Cada {movement.interval_count} {intervalLabel}
                  {movement.reminder_enabled
                    ? ` · Aviso ${reminderLead}, ${
                        reminderFrequency === 'once'
                          ? 'una vez al iniciar el plazo'
                          : reminderFrequency === 'daily'
                            ? 'cada día hasta el vencimiento'
                            : `cada ${movement.reminder_every_days} días`
                      }`
                    : ' · Sin avisos'}
                </p>
              </div>

              <div className="recurring-movement__actions">
                <button
                  className="button-primary"
                  disabled={!isOnline || isPending || !movement.active || !isDue}
                  onClick={() => void runAction(movement.id, () => onMarkPaid(movement))}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" size={17} />
                  <span>{movement.kind === 'expense' ? 'Marcar pagado' : 'Marcar cobrado'}</span>
                </button>
                {mode === 'management' ? (
                  <>
                    {previousOccurrencePayment && onUndoPayment ? (
                      <button
                        aria-label={`Deshacer ${movement.kind === 'expense' ? 'pago' : 'cobro'} recurrente de ${label}`}
                        disabled={!isOnline || isPending}
                        onClick={() =>
                          void runAction(movement.id, () =>
                            onUndoPayment(previousOccurrencePayment),
                          )
                        }
                        type="button"
                      >
                        <Undo2 aria-hidden="true" size={17} />
                        <span>
                          {movement.kind === 'expense' ? 'Deshacer pago' : 'Deshacer cobro'}
                        </span>
                      </button>
                    ) : null}
                    <label className="recurring-movement__reminder-toggle">
                      <input
                        checked={movement.reminder_enabled}
                        disabled={!isOnline || isPending}
                        onChange={(event) =>
                          void runAction(movement.id, () =>
                            onSetReminderEnabled(movement.id, event.target.checked),
                          )
                        }
                        type="checkbox"
                      />
                      <Bell aria-hidden="true" size={17} />
                      <span>Avisos</span>
                    </label>
                    <button
                      disabled={!isOnline || isPending}
                      onClick={() =>
                        void runAction(movement.id, () =>
                          onSetActive(movement.id, !movement.active),
                        )
                      }
                      type="button"
                    >
                      {movement.active ? (
                        <Pause aria-hidden="true" size={17} />
                      ) : (
                        <Play aria-hidden="true" size={17} />
                      )}
                      <span>{movement.active ? 'Pausar' : 'Reanudar'}</span>
                    </button>
                    <button
                      disabled={!isOnline || isPending}
                      onClick={() => onEdit?.(movement)}
                      type="button"
                    >
                      <Pencil aria-hidden="true" size={17} />
                      <span>Editar</span>
                    </button>
                    <button
                      disabled={!isOnline || isPending}
                      onClick={() =>
                        void runAction(movement.id, () => Promise.resolve(onDelete?.(movement)))
                      }
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={17} />
                      <span>Eliminar</span>
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
