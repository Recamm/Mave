import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const ownerOne = '00000000-0000-0000-0000-000000000061';
const ownerTwo = '00000000-0000-0000-0000-000000000062';
const timestamp = '2026-09-26T12:00:00.000Z';

type FixtureRow = Record<string, string | number | null>;

type BackendState = {
  rows: Record<string, FixtureRow[]>;
};

function createRows(): Record<string, FixtureRow[]> {
  return {
    financial_accounts: [
      {
        id: 'account-owner-one',
        user_id: ownerOne,
        name: 'Cash ARS',
        kind: 'cash',
        currency: 'ARS',
        opening_balance_text: '1000.10',
        created_at: timestamp,
      },
      {
        id: 'account-owner-two',
        user_id: ownerTwo,
        name: 'Foreign account secret',
        kind: 'bank',
        currency: 'USD',
        opening_balance_text: '999.99',
        created_at: timestamp,
      },
    ],
    categories: [
      {
        id: 'category-owner-one',
        user_id: ownerOne,
        name: 'Food',
        source: 'default',
        archived_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: 'category-owner-two',
        user_id: ownerTwo,
        name: 'Foreign category secret',
        source: 'custom',
        archived_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    movements: [
      {
        id: 'movement-owner-one',
        user_id: ownerOne,
        kind: 'expense',
        amount_text: '9007199254740993.01',
        currency: 'ARS',
        category_id: 'category-owner-one',
        occurred_on: '2026-09-25',
        financial_account_id: 'account-owner-one',
        note: 'Owner note',
        version: 1,
        client_operation_id: 'operation-owner-one',
        deleted_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
      {
        id: 'movement-owner-two',
        user_id: ownerTwo,
        kind: 'income',
        amount_text: '888.00',
        currency: 'USD',
        category_id: 'category-owner-two',
        occurred_on: '2026-09-25',
        financial_account_id: null,
        note: 'Foreign movement secret',
        version: 1,
        client_operation_id: 'operation-owner-two',
        deleted_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    refunds: [
      {
        id: 'refund-owner-one',
        user_id: ownerOne,
        expense_id: 'movement-owner-one',
        amount_text: '0.10',
        received_on: '2026-09-26',
        version: 1,
        client_operation_id: 'refund-operation-owner-one',
        deleted_at: null,
        created_at: timestamp,
        updated_at: timestamp,
      },
    ],
    transfers: [
      {
        id: 'transfer-owner-one',
        user_id: ownerOne,
        source_account_id: 'account-owner-one',
        destination_account_id: 'second-account-owner-one',
        amount_text: '12.50',
        occurred_on: '2026-09-26',
        client_operation_id: 'transfer-operation-owner-one',
        created_at: timestamp,
      },
    ],
    goals: [
      {
        id: 'goal-owner-one',
        user_id: ownerOne,
        name: 'Trip',
        target_amount_text: '50000.00',
        currency: 'ARS',
        target_date: '2027-01-01',
        created_at: timestamp,
      },
    ],
    goal_contributions: [
      {
        id: 'contribution-owner-one',
        user_id: ownerOne,
        goal_id: 'goal-owner-one',
        amount_text: '1.25',
        contributed_on: '2026-09-26',
        created_at: timestamp,
      },
    ],
  };
}

async function installSupabaseMock(page: Page): Promise<BackendState> {
  const state: BackendState = { rows: createRows() };

  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const corsHeaders = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers':
        'authorization, apikey, x-client-info, content-type, accept, prefer, content-profile, accept-profile, range, range-unit',
      'content-range': '0-0/1',
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
      const user = createAuthUser(email);
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
      await respond(createAuthUser('export-owner@example.invalid'));
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (url.pathname === '/rest/v1/account_lifecycle' && request.method() === 'GET') {
      await respond([
        {
          user_id: ownerOne,
          deletion_requested_at: null,
          deletion_due_at: null,
          deletion_canceled_at: null,
          deletion_started_at: null,
        },
      ]);
      return;
    }

    const table = url.pathname.split('/').at(-1) ?? '';
    if (request.method() === 'GET' && table in state.rows) {
      const ownerId = requestOwnerId(request);
      await respond(state.rows[table]?.filter((row) => row.user_id === ownerId) ?? []);
      return;
    }

    await respond({ message: `Unhandled E2E request: ${request.method()} ${url.pathname}` }, 404);
  });

  return state;
}

function createAuthUser(email: string) {
  return {
    id: ownerOne,
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
  await page.getByLabel('Correo electrónico').fill('export-owner@example.invalid');
  await page.getByLabel('Contraseña').fill('export-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
}

async function readDownload(page: Page, format: 'csv' | 'json'): Promise<string> {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: `Descargar ${format.toUpperCase()}` }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^mave-export-\\d{4}-\\d{2}-\\d{2}\\.${format}$`),
  );

  const path = await download.path();
  if (!path) {
    throw new Error('The export download did not produce a local file.');
  }
  return readFile(path, 'utf8');
}

test('downloads relational CSV and JSON exports without another owner data', async ({ page }) => {
  const backend = await installSupabaseMock(page);
  await signUp(page);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await page.getByRole('button', { name: 'Exportar datos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Exportar tus datos' });
  await expect(dialog).toBeVisible();

  const json = await readDownload(page, 'json');
  const parsed = JSON.parse(json) as {
    data: {
      accounts: { id: string; opening_balance: string }[];
      goal_contributions: { goal_id: string }[];
      goals: { id: string; target_amount: string }[];
      movements: { amount: string; category_id: string; occurred_on: string }[];
      refunds: { expense_id: string }[];
      transfers: { destination_account_id: string }[];
    };
  };

  expect(parsed.data.accounts[0]).toMatchObject({
    id: 'account-owner-one',
    opening_balance: '1000.10',
  });
  expect(parsed.data.movements[0]).toMatchObject({
    amount: '9007199254740993.01',
    category_id: 'category-owner-one',
    occurred_on: '2026-09-25',
  });
  expect(parsed.data.refunds[0]?.expense_id).toBe('movement-owner-one');
  expect(parsed.data.transfers[0]?.destination_account_id).toBe('second-account-owner-one');
  expect(parsed.data.goals[0]).toMatchObject({ id: 'goal-owner-one', target_amount: '50000.00' });
  expect(parsed.data.goal_contributions[0]?.goal_id).toBe('goal-owner-one');
  expect(json).not.toContain('owner-two');
  expect(json).not.toContain('Foreign movement secret');

  const csv = await readDownload(page, 'csv');
  expect(csv).toContain('entity_type,id,user_id');
  expect(csv).toContain('9007199254740993.01');
  expect(csv).toContain('movement-owner-one');
  expect(csv).toContain('refund-owner-one');
  expect(csv).toContain('transfer-owner-one');
  expect(csv).toContain('goal-owner-one');
  expect(csv).toContain('contribution-owner-one');
  expect(csv).not.toContain('Foreign account secret');
  expect(csv).not.toContain('Foreign movement secret');
  expect(Object.values(backend.rows).flat()).toHaveLength(10);
});
