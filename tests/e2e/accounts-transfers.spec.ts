import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const ownerOne = '00000000-0000-0000-0000-000000000001';
const ownerTwo = '00000000-0000-0000-0000-000000000002';
const categoryId = '10000000-0000-0000-0000-000000000001';
const timestamp = '2026-09-26T12:00:00.000Z';

type FinancialAccountFixture = {
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
  accounts: FinancialAccountFixture[];
  transfers: TransferFixture[];
};

async function installSupabaseMock(page: Page): Promise<BackendState> {
  const state: BackendState = {
    accounts: [
      {
        id: '20000000-0000-0000-0000-000099999999',
        user_id: ownerTwo,
        name: 'Cuenta privada ajena',
        kind: 'bank',
        currency: 'ARS',
        opening_balance: '900.00',
        opening_balance_text: '900.00',
        created_at: timestamp,
      },
    ],
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
      const accounts = state.accounts
        .filter((account) => account.user_id === ownerId)
        .sort((left, right) => left.name.localeCompare(right.name));
      await respond(accounts);
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

test('manages financial accounts and records only valid same-currency transfers', async ({
  page,
}) => {
  const backend = await installSupabaseMock(page);
  await signUp(page);

  await page.getByRole('link', { name: 'Cuentas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cuentas y transferencias' })).toBeVisible();

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
  const accountSelector = page.getByLabel('Cuenta activa');
  await expect(accountSelector).toHaveValue(bank.id);
  await expect(page.getByLabel('Balance actual')).toHaveText('ARS 225,50');
  await accountSelector.selectOption(cash.id);
  await expect(page.getByLabel('Balance actual')).toHaveText('ARS 874,50');
});
