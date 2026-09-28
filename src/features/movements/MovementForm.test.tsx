import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../categories/categoryService';
import type { MovementInput } from './movementInput';
import { MovementForm } from './MovementForm';
import type { RecurringMovement } from './recurringMovementService';
import type { RecurrenceSettings } from './recurrence';

const categories: Category[] = [
  {
    archived_at: null,
    id: 'category-services',
    name: 'Servicios',
    source: 'default',
  },
];

describe('MovementForm recurring entries', () => {
  it('submits a monthly movement with daily reminders one week ahead', async () => {
    const user = userEvent.setup();
    type OnSave = (input: MovementInput, recurrence?: RecurrenceSettings) => Promise<void>;
    const onSave = vi.fn<OnSave>(async () => {});
    render(
      <MovementForm
        categories={categories}
        financialAccounts={[]}
        onCancel={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Recurrente' }));
    await user.type(screen.getByLabelText('Importe'), '12500');
    await user.selectOptions(screen.getByLabelText('Categoría'), 'category-services');
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Gimnasio');
    await user.click(screen.getByRole('checkbox', { name: 'Activar avisos' }));
    await user.click(screen.getByRole('radio', { name: 'Cada día hasta el vencimiento' }));
    await user.click(screen.getByRole('button', { name: 'Crear recurrencia' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    const [movement, recurrence] = onSave.mock.calls[0];
    expect(movement).toMatchObject({
      amount: '12500',
      categoryId: 'category-services',
      currency: 'ARS',
      kind: 'expense',
      note: 'Gimnasio',
    });
    expect(recurrence).toEqual({
      intervalCount: 1,
      intervalUnit: 'month',
      reminderDaysBefore: 7,
      reminderEnabled: true,
      reminderFrequency: 'daily',
      reminderEveryDays: 1,
    });
  });

  it('edits a recurring movement while keeping its current one-time reminder', async () => {
    const user = userEvent.setup();
    type OnSave = (
      input: MovementInput,
      recurrence?: RecurrenceSettings,
      recurringMovementId?: string,
    ) => Promise<void>;
    const onSave = vi.fn<OnSave>(async () => {});
    const recurringMovement: RecurringMovement = {
      active: true,
      amount: '12500',
      amount_text: '12500',
      category_id: 'category-services',
      created_at: '2026-08-27T12:00:00.000Z',
      currency: 'ARS',
      deleted_at: null,
      financial_account_id: null,
      id: 'recurring-internet',
      interval_count: 1,
      interval_unit: 'month',
      kind: 'expense',
      last_notified_on: null,
      nextDueOn: '2026-09-27',
      note: 'Internet',
      occurrence_index: 0,
      reminder_days_before: 7,
      reminder_enabled: true,
      reminder_every_days: 8,
      starts_on: '2026-09-27',
      time_zone: 'America/Argentina/Buenos_Aires',
      updated_at: '2026-08-27T12:00:00.000Z',
      user_id: 'owner-one',
    };

    render(
      <MovementForm
        categories={categories}
        financialAccounts={[]}
        movement={null}
        onCancel={vi.fn()}
        onSave={onSave}
        recurringMovement={recurringMovement}
      />,
    );

    expect(screen.getByLabelText('Importe')).toHaveValue('12500');
    expect(screen.getByRole('radio', { name: 'Una vez, al iniciar el plazo' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Guardar recurrencia' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]).toMatchObject([
      { amount: '12500', occurredOn: '2026-09-27' },
      { reminderFrequency: 'once', reminderEveryDays: 8 },
      'recurring-internet',
    ]);
  });

  it('preserves an inherited same-day reminder and custom cadence while editing', async () => {
    const user = userEvent.setup();
    type OnSave = (
      input: MovementInput,
      recurrence?: RecurrenceSettings,
      recurringMovementId?: string,
    ) => Promise<void>;
    const onSave = vi.fn<OnSave>(async () => {});
    const recurringMovement: RecurringMovement = {
      active: true,
      amount: '12500',
      amount_text: '12500',
      category_id: 'category-services',
      created_at: '2026-08-27T12:00:00.000Z',
      currency: 'ARS',
      deleted_at: null,
      financial_account_id: null,
      id: 'recurring-internet',
      interval_count: 1,
      interval_unit: 'month',
      kind: 'expense',
      last_notified_on: null,
      nextDueOn: '2026-09-27',
      note: 'Internet',
      occurrence_index: 0,
      reminder_days_before: 0,
      reminder_enabled: true,
      reminder_every_days: 5,
      starts_on: '2026-09-27',
      time_zone: 'America/Argentina/Buenos_Aires',
      updated_at: '2026-08-27T12:00:00.000Z',
      user_id: 'owner-one',
    };

    render(
      <MovementForm
        categories={categories}
        financialAccounts={[]}
        onCancel={vi.fn()}
        onSave={onSave}
        recurringMovement={recurringMovement}
      />,
    );

    expect(screen.getByLabelText('Avisar antes')).toHaveValue('0');
    expect(
      screen.getByRole('option', { name: 'El día del vencimiento (configuración anterior)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Conservar cada 5 días (configuración anterior)' }),
    ).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Guardar recurrencia' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]).toMatchObject([
      { amount: '12500', occurredOn: '2026-09-27' },
      {
        reminderDaysBefore: 0,
        reminderFrequency: 'custom',
        reminderEveryDays: 5,
      },
      'recurring-internet',
    ]);
  });
});
