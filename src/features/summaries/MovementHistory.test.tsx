import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Category } from '../categories/categoryService';
import type { Movement } from '../movements/movementService';
import type { RecurringMovementPayment } from '../movements/recurringMovementService';
import { MovementHistory } from './MovementHistory';

const today = new Date();
const paidOn = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

const movement: Movement = {
  amount: '12500',
  category_id: 'category-services',
  created_at: '2026-08-27T12:00:00.000Z',
  currency: 'ARS',
  deleted_at: null,
  financial_account_id: null,
  id: 'movement-recurring-1',
  kind: 'expense',
  note: 'Internet',
  occurred_on: paidOn,
  syncStatus: 'synced',
  updated_at: '2026-08-27T12:00:00.000Z',
  user_id: 'owner-one',
  version: 1,
};

const category: Category = {
  archived_at: null,
  id: 'category-services',
  name: 'Servicios',
  source: 'default',
};

const recurringPayment: RecurringMovementPayment = {
  due_on: paidOn,
  movement_id: movement.id,
  occurrence_index: 0,
  paid_on: paidOn,
  recurring_movement_id: 'recurring-internet',
};

describe('MovementHistory recurring payments', () => {
  it('identifies recurring payments and offers the undo action instead of generic deletion', async () => {
    const user = userEvent.setup();
    const onUndoRecurringPayment = vi.fn(async () => {});

    render(
      <MovementHistory
        categories={[category]}
        financialAccounts={[]}
        isLoading={false}
        movements={[movement]}
        onDeleteMovement={vi.fn()}
        onDeleteRefund={vi.fn()}
        onEditMovement={vi.fn()}
        onRecordsChanged={vi.fn(async () => {})}
        onUndoRecurringPayment={onUndoRecurringPayment}
        recurringPayments={[recurringPayment]}
        refunds={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'General' }));
    await user.click(
      within(screen.getByRole('list', { name: 'Historial de movimientos' })).getByText('Servicios'),
    );

    expect(
      within(screen.getByRole('list', { name: 'Historial de movimientos' })).getByText(
        /Pago recurrente · vencía/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar movimiento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar movimiento' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deshacer pago recurrente de Servicios' }));

    expect(onUndoRecurringPayment).toHaveBeenCalledWith(movement);
  });
});
