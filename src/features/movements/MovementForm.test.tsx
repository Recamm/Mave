import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../categories/categoryService';
import type { MovementInput } from './movementInput';
import { MovementForm } from './MovementForm';
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
});
