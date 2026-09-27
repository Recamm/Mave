import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, CheckCircle2, Pause, Play } from 'lucide-react';
import { FeedbackMessage } from '../../app/components/FeedbackMessage';
import { formatCivilDate, formatMoney } from '../../lib/money/format';
import type { Category } from '../categories/categoryService';
import type { RecurringMovement } from './recurringMovementService';
import { getReminderFrequency, reminderLeadOptions } from './recurrence';

type RecurringMovementsPanelProps = {
  categories: Category[];
  loadFailed: boolean;
  movements: RecurringMovement[];
  onMarkPaid: (movement: RecurringMovement) => Promise<void>;
  onSetActive: (id: string, active: boolean) => Promise<void>;
  onSetReminderEnabled: (id: string, reminderEnabled: boolean) => Promise<void>;
};

const intervalLabels: Record<RecurringMovement['interval_unit'], [string, string]> = {
  day: ['día', 'días'],
  week: ['semana', 'semanas'],
  month: ['mes', 'meses'],
  year: ['año', 'años'],
};

export function RecurringMovementsPanel({
  categories,
  loadFailed,
  movements,
  onMarkPaid,
  onSetActive,
  onSetReminderEnabled,
}: RecurringMovementsPanelProps) {
  const { search } = useLocation();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
    if (!recurringId) {
      return;
    }
    document
      .getElementById(`recurring-${recurringId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [movements, recurringId]);

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

  if (movements.length === 0 && !loadFailed) {
    return null;
  }

  return (
    <section aria-labelledby="recurring-movements-title" className="recurring-movements">
      <div className="recurring-movements__heading">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2 id="recurring-movements-title">Pagos y cobros recurrentes</h2>
        </div>
        {movements.some((movement) => movement.reminder_enabled) ? (
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

      <div className="recurring-movements__list">
        {movements.map((movement) => {
          const category = categories.find((item) => item.id === movement.category_id);
          const label = movement.note?.trim() || category?.name || 'Movimiento recurrente';
          const [singular, plural] = intervalLabels[movement.interval_unit];
          const intervalLabel = movement.interval_count === 1 ? singular : plural;
          const reminderFrequency = getReminderFrequency(
            movement.reminder_days_before,
            movement.reminder_every_days,
          );
          const reminderLead =
            reminderLeadOptions.find((option) => option.days === movement.reminder_days_before)
              ?.label ?? `${movement.reminder_days_before} días antes`;
          const isPending = pendingId === movement.id;

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
                  disabled={!isOnline || isPending || !movement.active}
                  onClick={() => void runAction(movement.id, () => onMarkPaid(movement))}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" size={17} />
                  <span>{movement.kind === 'expense' ? 'Marcar pagado' : 'Marcar cobrado'}</span>
                </button>
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
                    void runAction(movement.id, () => onSetActive(movement.id, !movement.active))
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
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
