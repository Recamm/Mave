import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RecurringMovement, RecurringMovementPayment } from './recurringMovementService';
import { RecurringMovementsPanel } from './RecurringMovementsPanel';

function createRecurringMovement(
  id: string,
  note: string,
  nextDueOn: string,
  active = true,
): RecurringMovement {
  return {
    active,
    amount: '12500',
    amount_text: '12500',
    category_id: 'category-services',
    created_at: '2026-08-27T12:00:00.000Z',
    currency: 'ARS',
    deleted_at: null,
    financial_account_id: null,
    id,
    interval_count: 1,
    interval_unit: 'month',
    kind: 'expense',
    last_notified_on: null,
    nextDueOn,
    note,
    occurrence_index: 0,
    reminder_days_before: 7,
    reminder_enabled: false,
    reminder_every_days: 1,
    starts_on: nextDueOn,
    time_zone: 'America/Argentina/Buenos_Aires',
    updated_at: '2026-08-27T12:00:00.000Z',
    user_id: 'owner-one',
  };
}

describe('RecurringMovementsPanel', () => {
  it('shows all rules in management and disables payment until the due date', async () => {
    const user = userEvent.setup();
    const movement = createRecurringMovement('future', 'Internet', '2099-01-01');
    const onEdit = vi.fn();
    const onDelete = vi.fn(async () => {});

    render(
      <MemoryRouter>
        <RecurringMovementsPanel
          categories={[]}
          isLoading={false}
          loadFailed={false}
          mode="management"
          movements={[movement]}
          onDelete={onDelete}
          onEdit={onEdit}
          onMarkPaid={vi.fn(async () => {})}
          onSetActive={vi.fn(async () => {})}
          onSetReminderEnabled={vi.fn(async () => {})}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Pagos y cobros recurrentes' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Internet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Marcar pagado' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(onEdit).toHaveBeenCalledWith(movement);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(movement));
  });

  it('allows undoing the latest payment from management', async () => {
    const user = userEvent.setup();
    const movement = {
      ...createRecurringMovement('paid', 'Internet', '2099-01-01'),
      occurrence_index: 1,
      starts_on: '2026-09-27',
    };
    const payment: RecurringMovementPayment = {
      due_on: '2026-09-27',
      movement_id: 'paid-movement',
      occurrence_index: 0,
      paid_on: '2026-09-27',
      recurring_movement_id: movement.id,
    };
    const onUndoPayment = vi.fn(async () => {});

    render(
      <MemoryRouter>
        <RecurringMovementsPanel
          categories={[]}
          isLoading={false}
          loadFailed={false}
          mode="management"
          movements={[movement]}
          onMarkPaid={vi.fn(async () => {})}
          onSetActive={vi.fn(async () => {})}
          onSetReminderEnabled={vi.fn(async () => {})}
          onUndoPayment={onUndoPayment}
          payments={[payment]}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Deshacer pago recurrente de Internet' }));

    await waitFor(() => expect(onUndoPayment).toHaveBeenCalledWith(payment));
  });

  it('shows active unpaid occurrences on home and enables payment only once due locally', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T02:59:00.000Z'));
    try {
      render(
        <MemoryRouter>
          <RecurringMovementsPanel
            categories={[]}
            isLoading={false}
            loadFailed={false}
            mode="pending"
            movements={[
              createRecurringMovement('due', 'Vence hoy', '2026-09-27'),
              createRecurringMovement('future', 'Vence mañana', '2026-09-28'),
              createRecurringMovement('paused', 'Pausado', '2026-09-26', false),
            ]}
            onMarkPaid={vi.fn(async () => {})}
            onSetActive={vi.fn(async () => {})}
            onSetReminderEnabled={vi.fn(async () => {})}
          />
        </MemoryRouter>,
      );

      expect(
        screen.getByRole('heading', { name: 'Pagos y cobros pendientes' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('article', { name: 'Vence hoy' })).toBeInTheDocument();
      expect(screen.getByRole('article', { name: 'Vence mañana' })).toBeInTheDocument();
      expect(screen.queryByRole('article', { name: 'Pausado' })).not.toBeInTheDocument();
      expect(
        within(screen.getByRole('article', { name: 'Vence hoy' })).getByRole('button', {
          name: 'Marcar pagado',
        }),
      ).toBeEnabled();
      expect(
        within(screen.getByRole('article', { name: 'Vence mañana' })).getByRole('button', {
          name: 'Marcar pagado',
        }),
      ).toBeDisabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides a paid recurrence from home but keeps it visible in management', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    try {
      const movement = {
        ...createRecurringMovement('paid', 'Internet', '2026-10-27'),
        occurrence_index: 1,
        starts_on: '2026-09-27',
      };
      const payment: RecurringMovementPayment = {
        due_on: '2026-09-27',
        movement_id: 'paid-movement',
        occurrence_index: 0,
        paid_on: '2026-09-27',
        recurring_movement_id: movement.id,
      };
      const panel = (mode: 'pending' | 'management') => (
        <MemoryRouter>
          <RecurringMovementsPanel
            categories={[]}
            isLoading={false}
            loadFailed={false}
            mode={mode}
            movements={[movement]}
            onMarkPaid={vi.fn(async () => {})}
            onSetActive={vi.fn(async () => {})}
            onSetReminderEnabled={vi.fn(async () => {})}
            payments={[payment]}
          />
        </MemoryRouter>
      );
      const { rerender } = render(panel('pending'));

      expect(screen.queryByRole('article', { name: 'Internet' })).not.toBeInTheDocument();

      rerender(panel('management'));
      expect(screen.getByRole('article', { name: 'Internet' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the next occurrence at its local due date after hiding a paid one', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T02:59:00.000Z'));
    try {
      const movement = {
        ...createRecurringMovement('due', 'Vence hoy', '2026-09-28'),
        occurrence_index: 1,
        starts_on: '2026-09-27',
      };
      const payment: RecurringMovementPayment = {
        due_on: '2026-09-27',
        movement_id: 'previous-payment',
        occurrence_index: 0,
        paid_on: '2026-09-27',
        recurring_movement_id: movement.id,
      };
      render(
        <MemoryRouter>
          <RecurringMovementsPanel
            categories={[]}
            isLoading={false}
            loadFailed={false}
            mode="pending"
            movements={[movement]}
            onMarkPaid={vi.fn(async () => {})}
            onSetActive={vi.fn(async () => {})}
            onSetReminderEnabled={vi.fn(async () => {})}
            payments={[payment]}
          />
        </MemoryRouter>,
      );

      expect(screen.queryByRole('article', { name: 'Vence hoy' })).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(60_000));
      expect(
        within(screen.getByRole('article', { name: 'Vence hoy' })).getByRole('button', {
          name: 'Marcar pagado',
        }),
      ).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});
