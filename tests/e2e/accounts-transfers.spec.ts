import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const ownerOne = '00000000-0000-0000-0000-000000000001';
const ownerTwo = '00000000-0000-0000-0000-000000000002';
const categoryId = '10000000-0000-0000-0000-000000000001';
const timestamp = '2026-09-26T12:00:00.000Z';

type FinancialAccountFixture = {
  archived_at: string | null;
  created_at: string;
  currency: 'ARS' | 'USD';
  id: string;
  kind: 'cash' | 'bank' | 'wallet' | 'other';
  name: string;
  opening_balance: string | null;
  opening_balance_text: string | null;
  user_id: string;
};

type TransferFixture = {
  amount: string;
  amount_text: string;
  client_operation_id: string;
  created_at: string;
  destination_account_id: string;
  id: string;
  occurred_on: string;
  source_account_id: string;
  user_id: string;
};

type BackendState = {
  accountReadDelayMs: number;
  accounts: FinancialAccountFixture[];
  permanentDeleteRequests: string[];
  transfers: TransferFixture[];
};

async function installSupabaseMock(page: Page): Promise<BackendState> {
  const state: BackendState = {
    accountReadDelayMs: 0,
    accounts: [
      {
        id: '20000000-0000-0000-0000-000099999999',
        user_id: ownerTwo,
        archived_at: null,
        name: 'Cuenta privada ajena',
        kind: 'bank',
        currency: 'ARS',
        opening_balance: '900.00',
        opening_balance_text: '900.00',
        created_at: timestamp,
      },
    ],
    permanentDeleteRequests: [],
    transfers: [],
  };
  const operations = new Map<string, TransferFixture>();
  let accountSequence = 0;
  let transferSequence = 0;

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
      const { email } = request.postDataJSON() as { email: string };
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const user = createAuthUser(ownerOne, email);
      const accessToken = `header.${Buffer.from(
        JSON.stringify({ sub: ownerOne, exp: expiresAt }),
      ).toString('base64url')}.signature`;

      await respond({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        refresh_token: `refresh-${ownerOne}`,
        user,
      });
      return;
    }

    if (url.pathname === '/auth/v1/user') {
      await respond(createAuthUser(ownerOne, 'accounts-owner@example.invalid'));
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const ownerId = requestOwnerId(request);
    if (url.pathname === '/rest/v1/categories' && request.method() === 'GET') {
      await respond([
        {
          id: categoryId,
          name: 'Alimentación',
          source: 'default',
          archived_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ]);
      return;
    }

    if (url.pathname === '/rest/v1/financial_accounts' && request.method() === 'GET') {
      if (state.accountReadDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.accountReadDelayMs));
      }
      const accounts = state.accounts
        .filter((account) => account.user_id === ownerId)
        .filter(
          (account) =>
            url.searchParams.get('archived_at') !== 'is.null' || account.archived_at === null,
        )
        .sort((left, right) => left.name.localeCompare(right.name));
      await respond(accounts);
      return;
    }

    if (url.pathname === '/rest/v1/financial_accounts' && request.method() === 'PATCH') {
      const accountId = url.searchParams.get('id')?.replace(/^eq\./, '');
      const input = request.postDataJSON() as { archived_at: string | null };
      const account = state.accounts.find(
        (candidate) => candidate.id === accountId && candidate.user_id === ownerId,
      );
      if (!account) {
        await respond({ message: 'Account not found.' }, 404);
        return;
      }

      account.archived_at = input.archived_at;
      await respond({ id: account.id });
      return;
    }

    if (
      url.pathname === '/rest/v1/rpc/delete_archived_financial_account' &&
      request.method() === 'POST'
    ) {
      const { p_account_id: accountId } = request.postDataJSON() as { p_account_id: string };
      state.permanentDeleteRequests.push(accountId);
      const account = state.accounts.find(
        (candidate) => candidate.id === accountId && candidate.user_id === ownerId,
      );
      if (!account || !account.archived_at) {
        await respond('unavailable');
        return;
      }
      if (
        state.transfers.some(
          (transfer) =>
            transfer.source_account_id === accountId ||
            transfer.destination_account_id === accountId,
        )
      ) {
        await respond('referenced');
        return;
      }

      state.accounts = state.accounts.filter((candidate) => candidate.id !== accountId);
      await respond('deleted');
      return;
    }

    if (url.pathname === '/rest/v1/financial_accounts' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        currency: 'ARS' | 'USD';
        kind: FinancialAccountFixture['kind'];
        name: string;
        opening_balance: string | null;
      };
      accountSequence += 1;
      const account: FinancialAccountFixture = {
        ...input,
        id: `20000000-0000-0000-0000-${String(accountSequence).padStart(12, '0')}`,
        user_id: ownerId,
        archived_at: null,
        opening_balance_text: input.opening_balance,
        created_at: timestamp,
      };
      state.accounts.push(account);
      await respond(account, 201);
      return;
    }

    if (url.pathname === '/rest/v1/movements' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/refunds' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/goals' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/goal_contributions' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/transfers' && request.method() === 'GET') {
      await respond(state.transfers.filter((transfer) => transfer.user_id === ownerId));
      return;
    }

    if (url.pathname === '/rest/v1/rpc/record_transfer' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        p_amount: string;
        p_destination_account_id: string;
        p_occurred_on: string;
        p_operation_id: string;
        p_source_account_id: string;
      };
      const operationKey = `${ownerId}:${input.p_operation_id}`;
      const existing = operations.get(operationKey);
      if (existing) {
        await respond(existing);
        return;
      }

      const source = state.accounts.find(
        (account) => account.user_id === ownerId && account.id === input.p_source_account_id,
      );
      const destination = state.accounts.find(
        (account) => account.user_id === ownerId && account.id === input.p_destination_account_id,
      );
      if (!source || !destination) {
        await respond(
          { code: '42501', message: 'Transfer accounts must belong to the authenticated owner.' },
          400,
        );
        return;
      }
      if (source.id === destination.id || source.currency !== destination.currency) {
        await respond({ code: '23514', message: 'Transfer accounts are invalid.' }, 400);
        return;
      }

      transferSequence += 1;
      const transfer: TransferFixture = {
        id: `30000000-0000-0000-0000-${String(transferSequence).padStart(12, '0')}`,
        user_id: ownerId,
        source_account_id: source.id,
        destination_account_id: destination.id,
        amount: input.p_amount,
        amount_text: input.p_amount,
        occurred_on: input.p_occurred_on,
        client_operation_id: input.p_operation_id,
        created_at: timestamp,
      };
      operations.set(operationKey, transfer);
      state.transfers.push(transfer);
      await respond(transfer);
      return;
    }

    await respond({ message: `Unhandled E2E request: ${request.method()} ${url.pathname}` }, 404);
  });

  return state;
}

function createAuthUser(id: string, email: string) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: timestamp,
    updated_at: timestamp,
    email_confirmed_at: timestamp,
  };
}

function requestOwnerId(request: { headers: () => Record<string, string> }): string {
  const token = request.headers().authorization?.replace('Bearer ', '');
  if (!token) {
    return ownerOne;
  }

  const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
    sub?: string;
  };
  return payload.sub === ownerTwo ? ownerTwo : ownerOne;
}

async function signUp(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await page.getByLabel('Correo electrónico').fill('accounts-owner@example.invalid');
  await page.getByLabel('Contraseña').fill('accounts-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
}

async function createAccount(
  page: Page,
  input: {
    name: string;
    kind: FinancialAccountFixture['kind'];
    currency: 'ARS' | 'USD';
    openingBalance: string;
  },
) {
  const accountsPanel = page.locator('details.accounts-panel');
  if ((await accountsPanel.getAttribute('open')) === null) {
    await accountsPanel.locator('summary').click();
  }

  await page.getByRole('button', { name: 'Agregar cuenta', exact: true }).click();
  const form = page.getByRole('form', { name: 'Crear cuenta financiera' });
  await form.getByLabel('Nombre de cuenta').fill(input.name);
  await form.getByLabel('Tipo de cuenta').selectOption(input.kind);
  await form.getByLabel('Moneda').selectOption(input.currency);
  await form.getByLabel('Saldo inicial (opcional)').fill(input.openingBalance);
  await form.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(
    page.getByRole('list', { name: 'Cuentas financieras' }).getByRole('listitem').filter({
      hasText: input.name,
    }),
  ).toBeVisible();
}

async function pullToRefresh(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const accountsPage = document.querySelector('.accounts-page');
    if (!accountsPage) {
      throw new Error('The accounts page must be mounted.');
    }

    const startTouch = new Touch({ identifier: 1, target: accountsPage, clientX: 40, clientY: 20 });
    const endTouch = new Touch({ identifier: 1, target: accountsPage, clientX: 40, clientY: 110 });
    accountsPage.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [startTouch],
        targetTouches: [startTouch],
        changedTouches: [startTouch],
      }),
    );
    accountsPage.dispatchEvent(
      new TouchEvent('touchmove', {
        bubbles: true,
        cancelable: true,
        touches: [endTouch],
        targetTouches: [endTouch],
        changedTouches: [endTouch],
      }),
    );
    accountsPage.dispatchEvent(
      new TouchEvent('touchend', {
        bubbles: true,
        cancelable: true,
        touches: [],
        targetTouches: [],
        changedTouches: [endTouch],
      }),
    );
  });
}

test('manages financial accounts and records only valid same-currency transfers', async ({
  page,
}) => {
  const backend = await installSupabaseMock(page);
  await signUp(page);

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión financiera' })).toBeVisible();
  const accountsPanel = page.locator('details.accounts-panel');
  await expect(accountsPanel).not.toHaveAttribute('open', '');
  await accountsPanel.locator('summary').click();
  await expect(accountsPanel).toHaveAttribute('open', '');

  await createAccount(page, {
    name: 'Efectivo ARS',
    kind: 'cash',
    currency: 'ARS',
    openingBalance: '1000.00',
  });
  await createAccount(page, {
    name: 'Banco ARS',
    kind: 'bank',
    currency: 'ARS',
    openingBalance: '100.00',
  });
  await createAccount(page, {
    name: 'Billetera USD',
    kind: 'wallet',
    currency: 'USD',
    openingBalance: '25.00',
  });
  await createAccount(page, {
    name: 'Otra fuente',
    kind: 'other',
    currency: 'USD',
    openingBalance: '0',
  });

  await page.getByRole('button', { name: 'Registrar transferencia', exact: true }).click();
  const transferForm = page.getByRole('form', { name: 'Registrar transferencia' });
  const source = transferForm.getByLabel('Cuenta de origen');
  const destination = transferForm.getByLabel('Cuenta de destino');
  const cash = backend.accounts.find((account) => account.name === 'Efectivo ARS');
  const bank = backend.accounts.find((account) => account.name === 'Banco ARS');
  if (!cash || !bank) {
    throw new Error('The same-currency account fixtures were not created.');
  }

  await source.selectOption(cash.id);
  await expect(destination.getByRole('option', { name: 'Billetera USD' })).toHaveCount(0);
  await expect(destination.getByRole('option', { name: 'Cuenta privada ajena' })).toHaveCount(0);
  await expect(destination.getByRole('option', { name: 'Efectivo ARS' })).toHaveCount(0);
  await destination.selectOption(bank.id);
  await transferForm.getByLabel('Importe').fill('125.50');
  await transferForm.getByLabel('Fecha').fill('2026-09-26');
  await transferForm.getByRole('button', { name: 'Registrar transferencia' }).click();

  const transferHistoryPanel = page.locator('details.transfer-history');
  await expect(transferHistoryPanel).not.toHaveAttribute('open', '');
  await transferHistoryPanel.locator('summary').click();
  const history = page.getByRole('list', { name: 'Historial de transferencias' });
  await expect(history).toContainText('Efectivo ARS');
  await expect(history).toContainText('Banco ARS');
  await expect(history).toContainText('ARS 125,50');
  expect(backend.transfers).toHaveLength(1);
  expect(backend.transfers[0]?.source_account_id).toBe(cash.id);
  expect(backend.transfers[0]?.destination_account_id).toBe(bank.id);

  const accountsList = page.getByRole('list', { name: 'Cuentas financieras' });
  await expect(
    accountsList.getByRole('listitem').filter({ hasText: 'Efectivo ARS' }),
  ).toContainText('ARS 874,50');
  await expect(accountsList.getByRole('listitem').filter({ hasText: 'Banco ARS' })).toContainText(
    'ARS 225,50',
  );
  expect(backend.accounts.filter((account) => account.user_id === ownerOne)).toHaveLength(4);
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  const desktopOverview = page.locator('.dashboard-overview');
  const desktopOverviewBounds = await desktopOverview.boundingBox();
  const desktopBody = page.locator('.dashboard-overview__body');
  const desktopBodyBounds = await desktopBody.boundingBox();
  const desktopBalance = page.getByRole('region', { name: 'Balance de la cuenta seleccionada' });
  const desktopAccountSelector = page.getByRole('combobox', { name: 'Cuenta principal' });
  await expect(desktopAccountSelector).toBeVisible();
  await desktopAccountSelector.selectOption(bank.id);
  const desktopBalanceBounds = await desktopBalance.boundingBox();
  const desktopAccountBounds = await desktopAccountSelector.boundingBox();
  const desktopAmountBounds = await page.locator('.dashboard-balance__amount-group').boundingBox();
  const desktopFlowsBounds = await page.locator('.dashboard-flows').boundingBox();
  const desktopActionsBounds = await desktopBody.locator('.dashboard-actions__list').boundingBox();
  const desktopNewMovementBounds = await page
    .getByRole('button', { name: 'Nuevo movimiento' })
    .boundingBox();
  const desktopTransferBounds = await page.getByRole('link', { name: 'Transferir' }).boundingBox();
  if (
    !desktopBalanceBounds ||
    !desktopOverviewBounds ||
    !desktopBodyBounds ||
    !desktopAccountBounds ||
    !desktopAmountBounds ||
    !desktopFlowsBounds ||
    !desktopActionsBounds ||
    !desktopNewMovementBounds ||
    !desktopTransferBounds
  ) {
    throw new Error('The desktop account overview must have visible bounds.');
  }
  expect(
    Math.abs(
      desktopAccountBounds.x +
        desktopAccountBounds.width / 2 -
        (desktopOverviewBounds.x + desktopOverviewBounds.width / 2),
    ),
  ).toBeLessThanOrEqual(1);
  expect(desktopAccountBounds.y + desktopAccountBounds.height).toBeLessThan(desktopBodyBounds.y);
  expect(desktopFlowsBounds.y).toBeGreaterThan(desktopAmountBounds.y);
  expect(
    Math.abs(
      desktopBalanceBounds.y +
        desktopBalanceBounds.height / 2 -
        (desktopActionsBounds.y + desktopActionsBounds.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  expect(desktopActionsBounds.x).toBeGreaterThan(
    desktopBalanceBounds.x + desktopBalanceBounds.width,
  );
  expect(desktopTransferBounds.y).toBeGreaterThan(desktopNewMovementBounds.y);

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión financiera' })).toBeVisible();
  await expect(accountsPanel).not.toHaveAttribute('open', '');
  await accountsPanel.locator('summary').click();
  backend.accountReadDelayMs = 250;
  await expect(page.getByRole('button', { name: 'Actualizar' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await pullToRefresh(page);
  const refreshStatus = page.getByRole('status', {
    name: 'Actualizando cuentas y transferencias',
  });
  await expect(refreshStatus).toBeVisible();
  await expect(refreshStatus).toBeHidden();
  backend.accountReadDelayMs = 0;
  await accountsList
    .getByRole('button', { name: 'Establecer Efectivo ARS como cuenta principal' })
    .click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  const accountSelector = page.getByRole('combobox', { name: 'Cuenta principal' });
  await expect(accountSelector).toHaveValue(cash.id);
  const headerBounds = await page.locator('.session-strip').boundingBox();
  const accountSelectorBounds = await accountSelector.boundingBox();
  if (!headerBounds || !accountSelectorBounds) {
    throw new Error('The mobile header and account selector must have visible bounds.');
  }
  expect(accountSelectorBounds.y - headerBounds.y - headerBounds.height).toBeLessThan(32);
  await expect(page.getByLabel('Balance actual')).toHaveText('ARS 874,50');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await expect(accountSelector).toHaveValue(cash.id);
  await accountSelector.selectOption(bank.id);
  await expect(page.getByLabel('Balance actual')).toHaveText('ARS 225,50');

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await page.locator('details.accounts-panel > summary').click();
  const activeAccounts = page.getByRole('list', { name: 'Cuentas financieras' });
  const confirmationMessages: string[] = [];
  let cancelNextConfirmation = false;
  page.on('dialog', async (dialog) => {
    confirmationMessages.push(dialog.message());
    if (cancelNextConfirmation) {
      cancelNextConfirmation = false;
      await dialog.dismiss();
      return;
    }
    await dialog.accept();
  });
  await activeAccounts.getByRole('button', { name: 'Eliminar Banco ARS' }).click();
  await expect(activeAccounts.getByRole('listitem').filter({ hasText: 'Banco ARS' })).toHaveCount(
    0,
  );
  await page.getByText(/Cuentas archivadas/).click();
  const archivedAccounts = page.getByRole('list', { name: 'Cuentas archivadas' });
  await archivedAccounts
    .getByRole('button', { name: 'Eliminar permanentemente Banco ARS' })
    .click();
  await expect(
    page.getByText(/No se puede eliminar Banco ARS: conserva movimientos/),
  ).toBeVisible();
  expect(backend.permanentDeleteRequests).toEqual([bank.id]);
  await page.getByRole('button', { name: 'Restaurar Banco ARS' }).click();
  await expect(activeAccounts.getByRole('listitem').filter({ hasText: 'Banco ARS' })).toBeVisible();

  const otherAccount = backend.accounts.find((account) => account.name === 'Otra fuente');
  if (!otherAccount) {
    throw new Error('The unused account fixture was not created.');
  }
  await activeAccounts.getByRole('button', { name: 'Eliminar Otra fuente' }).click();
  await page.getByText(/Cuentas archivadas/).click();
  const permanentlyDeleteOther = archivedAccounts.getByRole('button', {
    name: 'Eliminar permanentemente Otra fuente',
  });
  cancelNextConfirmation = true;
  await permanentlyDeleteOther.click();
  await expect(
    archivedAccounts.getByRole('listitem').filter({ hasText: 'Otra fuente' }),
  ).toBeVisible();
  expect(backend.permanentDeleteRequests).toEqual([bank.id]);
  await permanentlyDeleteOther.click();
  await expect(
    archivedAccounts.getByRole('listitem').filter({ hasText: 'Otra fuente' }),
  ).toHaveCount(0);
  expect(backend.accounts.some((account) => account.id === otherAccount.id)).toBe(false);
  expect(confirmationMessages).toContain(
    '¿Eliminar permanentemente Banco ARS? Esta acción no se puede deshacer.',
  );
  expect(backend.permanentDeleteRequests).toEqual([bank.id, otherAccount.id]);
});
