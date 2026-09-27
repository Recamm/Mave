import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const ownerId = '00000000-0000-0000-0000-000000000001';
const foodCategoryId = '10000000-0000-0000-0000-000000000001';
const incomeCategoryId = '10000000-0000-0000-0000-000000000009';
const accountId = '20000000-0000-0000-0000-000000000001';
const expenseId = '30000000-0000-0000-0000-000000000002';
const timestamp = '2026-09-26T12:00:00.000Z';

type CategoryFixture = {
  id: string;
  name: string;
  source: 'default' | 'custom';
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MovementFixture = {
  id: string;
  user_id: string;
  kind: 'income' | 'expense';
  amount: string;
  amount_text: string;
  currency: 'ARS' | 'USD';
  category_id: string;
  occurred_on: string;
  financial_account_id: string | null;
  note: string | null;
  version: number;
  client_operation_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RefundFixture = {
  id: string;
  user_id: string;
  expense_id: string;
  amount: string;
  amount_text: string;
  received_on: string;
  version: number;
  client_operation_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type RefundRpcInput = {
  p_action: 'create' | 'update' | 'delete';
  p_operation_id: string;
  p_refund_id: string | null;
  p_expense_id: string | null;
  p_amount: string | null;
  p_received_on: string | null;
  p_expected_version: number | null;
};

function createMovement(
  id: string,
  kind: 'income' | 'expense',
  amount: string,
  currency: 'ARS' | 'USD',
  categoryId: string,
  occurredOn: string,
  financialAccountId: string | null = null,
): MovementFixture {
  return {
    id,
    user_id: ownerId,
    kind,
    amount,
    amount_text: amount,
    currency,
    category_id: categoryId,
    occurred_on: occurredOn,
    financial_account_id: financialAccountId,
    note: null,
    version: 1,
    client_operation_id: id.replace('3', '9'),
    deleted_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

test('summarizes a month by currency and category and records partial refunds', async ({
  page,
}) => {
  const categories: CategoryFixture[] = [
    {
      id: foodCategoryId,
      name: 'Alimentación',
      source: 'default',
      archived_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: incomeCategoryId,
      name: 'Ingresos',
      source: 'default',
      archived_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
  const movements = [
    createMovement(
      '30000000-0000-0000-0000-000000000001',
      'income',
      '1000.00',
      'ARS',
      incomeCategoryId,
      '2026-09-08',
    ),
    createMovement(expenseId, 'expense', '300.00', 'ARS', foodCategoryId, '2026-09-12', accountId),
    createMovement(
      '30000000-0000-0000-0000-000000000003',
      'income',
      '10.00',
      'USD',
      incomeCategoryId,
      '2026-09-14',
    ),
    createMovement(
      '30000000-0000-0000-0000-000000000004',
      'expense',
      '3.00',
      'USD',
      foodCategoryId,
      '2026-09-18',
    ),
    createMovement(
      '30000000-0000-0000-0000-000000000005',
      'expense',
      '40.00',
      'ARS',
      foodCategoryId,
      '2026-07-30',
      accountId,
    ),
  ];
  const refunds: RefundFixture[] = [];
  let refundSequence = 0;

  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers':
        'authorization, apikey, x-client-info, content-type, accept, prefer, content-profile, accept-profile',
    };
    const respond = (body: unknown, status = 200) =>
      route.fulfill({ status, headers: corsHeaders, json: body });

    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (url.pathname === '/auth/v1/signup') {
      const requestBody = request.postDataJSON() as { email: string };
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const user = {
        id: ownerId,
        aud: 'authenticated',
        role: 'authenticated',
        email: requestBody.email,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: timestamp,
        updated_at: timestamp,
        email_confirmed_at: timestamp,
      };
      const accessToken = `header.${Buffer.from(
        JSON.stringify({ sub: ownerId, exp: expiresAt }),
      ).toString('base64url')}.signature`;

      await respond({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        refresh_token: 'summary-e2e-refresh-token',
        user,
      });
      return;
    }

    if (url.pathname === '/auth/v1/user') {
      await respond({
        id: ownerId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'mave-summary@example.invalid',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: timestamp,
        updated_at: timestamp,
      });
      return;
    }

    if (url.pathname === '/rest/v1/categories' && request.method() === 'GET') {
      await respond(categories);
      return;
    }

    if (url.pathname === '/rest/v1/financial_accounts' && request.method() === 'GET') {
      await respond([{ id: accountId, name: 'Banco ARS', currency: 'ARS', archived_at: null }]);
      return;
    }

    if (url.pathname === '/rest/v1/transfers' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/movements' && request.method() === 'GET') {
      await respond(movements.filter((movement) => movement.deleted_at === null));
      return;
    }

    if (url.pathname === '/rest/v1/refunds' && request.method() === 'GET') {
      await respond(refunds.filter((refund) => refund.deleted_at === null));
      return;
    }

    if (url.pathname === '/rest/v1/rpc/record_refund' && request.method() === 'POST') {
      const input = request.postDataJSON() as RefundRpcInput;
      let refund = input.p_refund_id
        ? refunds.find((item) => item.id === input.p_refund_id)
        : undefined;

      if (input.p_action === 'create') {
        refundSequence += 1;
        refund = {
          id: `40000000-0000-0000-0000-${String(refundSequence).padStart(12, '0')}`,
          user_id: ownerId,
          expense_id: input.p_expense_id ?? expenseId,
          amount: input.p_amount ?? '0',
          amount_text: input.p_amount ?? '0',
          received_on: input.p_received_on ?? '2026-09-26',
          version: 1,
          client_operation_id: input.p_operation_id,
          deleted_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        refunds.push(refund);
      } else if (refund && input.p_action === 'update') {
        Object.assign(refund, {
          amount: input.p_amount ?? refund.amount,
          amount_text: input.p_amount ?? refund.amount_text,
          received_on: input.p_received_on ?? refund.received_on,
          version: refund.version + 1,
          client_operation_id: input.p_operation_id,
          updated_at: timestamp,
        });
      } else if (refund && input.p_action === 'delete') {
        Object.assign(refund, {
          deleted_at: timestamp,
          version: refund.version + 1,
          client_operation_id: input.p_operation_id,
          updated_at: timestamp,
        });
      }

      if (!refund) {
        await respond({ message: 'Refund not found' }, 404);
        return;
      }

      await respond(refund);
      return;
    }

    await respond({ message: `Unhandled E2E request: ${request.method()} ${url.pathname}` }, 404);
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await page.getByLabel('Correo electrónico').fill('mave-summary@example.invalid');
  await page.getByLabel('Contraseña').fill('summary-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión financiera' })).toBeVisible();
  const periodSummaryPanel = page.locator('#period-summary');
  await expect(periodSummaryPanel).not.toHaveAttribute('open', '');
  await periodSummaryPanel.locator('summary').click();
  await expect(periodSummaryPanel).toHaveAttribute('open', '');
  const summary = page.getByRole('region', { name: 'Resumen del período' });
  const periodInput = summary.getByLabel('Período');
  await expect(periodInput).toHaveValue('2026-09');
  await expect(summary.getByLabel('Ingresos ARS')).toHaveText('ARS 1.000,00');
  await expect(summary.getByLabel('Gastos netos ARS')).toHaveText('ARS 300,00');
  await expect(summary.getByLabel('Diferencia neta ARS')).toHaveText('ARS 700,00');
  await expect(summary.getByLabel('Ingresos USD')).toHaveText('USD 10,00');
  await expect(summary.getByLabel('Gastos netos USD')).toHaveText('USD 3,00');
  await expect(summary.getByRole('list', { name: 'Totales por categoría' })).toContainText(
    'Alimentación',
  );

  await periodInput.fill('2026-08');
  await expect(summary).toContainText('No hay movimientos en este período.');
  await expect(summary.getByLabel('Ingresos ARS')).toHaveCount(0);
  await periodInput.fill('2026-09');
  await expect(summary.getByLabel('Gastos netos ARS')).toHaveText('ARS 300,00');

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Ver todos los movimientos' }).click();
  const fullHistory = page.getByRole('dialog', { name: 'Todos los movimientos' });
  const arsExpense = fullHistory.locator('.movement-row').filter({ hasText: 'ARS 300,00' });
  await arsExpense.locator('details').first().locator('summary').click();
  await arsExpense.getByRole('button', { name: 'Registrar devolución' }).click();
  const refundForm = page.getByRole('form', { name: 'Registrar devolución' });
  await refundForm.getByLabel('Importe de devolución').fill('100.50');
  await refundForm.getByLabel('Fecha de recepción').fill('2026-09-20');
  await refundForm.getByRole('button', { name: 'Registrar devolución' }).click();
  await fullHistory.getByRole('button', { name: 'Cerrar historial' }).click();

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await page.locator('#period-summary > summary').click();
  await expect(summary.getByLabel('Gastos netos ARS')).toHaveText('ARS 199,50');
  await expect(summary.getByLabel('Ingresos ARS')).toHaveText('ARS 1.000,00');

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Ver todos los movimientos' }).click();
  const editHistory = page.getByRole('dialog', { name: 'Todos los movimientos' });
  const editableArsExpense = editHistory.locator('.movement-row').filter({ hasText: 'ARS 300,00' });
  await editableArsExpense.locator('details').first().locator('summary').click();
  await editableArsExpense.getByRole('button', { name: 'Editar devolución' }).click();
  const editRefundForm = page.getByRole('form', { name: 'Editar devolución' });
  await editRefundForm.getByLabel('Importe de devolución').fill('125.25');
  await editRefundForm.getByLabel('Fecha de recepción').fill('2026-09-21');
  await editRefundForm.getByRole('button', { name: 'Guardar devolución' }).click();
  await editHistory.getByRole('button', { name: 'Cerrar historial' }).click();

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await page.locator('#period-summary > summary').click();
  await expect(summary.getByLabel('Gastos netos ARS')).toHaveText('ARS 174,75');

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Ver todos los movimientos' }).click();
  const deleteHistory = page.getByRole('dialog', { name: 'Todos los movimientos' });
  const refundableExpense = deleteHistory.locator('.movement-row').filter({
    hasText: 'ARS 300,00',
  });
  await refundableExpense.locator('details').first().locator('summary').click();
  page.on('dialog', (dialog) => dialog.accept());
  await refundableExpense.getByRole('button', { name: 'Eliminar devolución' }).click();
  await deleteHistory.getByRole('button', { name: 'Cerrar historial' }).click();

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await page.locator('#period-summary > summary').click();
  await expect(summary.getByLabel('Gastos netos ARS')).toHaveText('ARS 300,00');

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Ver todos los movimientos' }).click();
  const julyHistory = page.getByRole('dialog', { name: 'Todos los movimientos' });
  const julyExpense = julyHistory.locator('.movement-row').filter({ hasText: 'ARS 40,00' });
  await julyExpense.locator('details').first().locator('summary').click();
  await julyExpense.getByRole('button', { name: 'Registrar devolución' }).click();
  const julyRefundForm = page.getByRole('form', { name: 'Registrar devolución' });
  await julyRefundForm.getByLabel('Importe de devolución').fill('40.00');
  await julyRefundForm.getByLabel('Fecha de recepción').fill('2026-08-05');
  await julyRefundForm.getByRole('button', { name: 'Registrar devolución' }).click();
  await julyHistory.getByRole('button', { name: 'Cerrar historial' }).click();

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await page.locator('#period-summary > summary').click();
  await periodInput.fill('2026-08');
  await expect(summary.getByLabel('Gastos netos ARS')).toHaveText('ARS -40,00');
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await page.getByRole('button', { name: 'Ver todos los movimientos' }).click();
  const groupedHistory = page.getByRole('dialog', { name: 'Todos los movimientos' });
  const julyDay = groupedHistory.locator('.movement-history-day').filter({
    hasText: '30 de julio de 2026',
  });
  await expect(julyDay.locator('h3 time')).toHaveAttribute('datetime', '2026-07-30');
  const refundedJulyExpense = julyDay.locator('.movement-row').filter({ hasText: 'ARS 40,00' });
  await refundedJulyExpense.locator('details').first().locator('summary').click();
  await expect(refundedJulyExpense).toContainText('05/08/2026');
  await groupedHistory.getByRole('button', { name: 'Cerrar historial' }).click();

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await page.getByRole('link', { name: 'Estadísticas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();
  const statisticsPeriod = page.getByLabel('Elegir mes');
  await expect(statisticsPeriod).toHaveValue('2026-09');
  await expect(page.getByLabel('Ingresos ARS')).toHaveText('ARS 1.000,00');
  await expect(page.getByLabel('Gastos netos ARS')).toHaveText('ARS 300,00');
  await expect(
    page.getByRole('list', { name: 'Categorías ordenadas por gasto neto' }),
  ).toContainText('Alimentación');
  await expect(
    page.getByRole('img', {
      name: 'Importes diarios de ingresos, gastos y devoluciones en septiembre de 2026, ARS',
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'USD', exact: true }).click();
  await expect(page.getByLabel('Ingresos USD')).toHaveText('USD 10,00');
  await expect(page.getByLabel('Gastos netos USD')).toHaveText('USD 3,00');
  await expect(page.getByRole('button', { name: 'USD', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await statisticsPeriod.fill('2026-08');
  await expect(statisticsPeriod).toHaveValue('2026-08');
  await expect(page.getByLabel('Devoluciones USD')).toHaveText('USD 0,00');
});
