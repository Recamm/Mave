import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const ownerId = '00000000-0000-0000-0000-000000000071';
const categoryId = '10000000-0000-0000-0000-000000000071';
const startTime = '2026-09-26T12:00:00.000Z';
const expiresAt = Math.floor(Date.parse(startTime) / 1000) + 90 * 24 * 60 * 60;

type LifecycleFixture = {
  deletion_canceled_at: string | null;
  deletion_due_at: string | null;
  deletion_requested_at: string | null;
  deletion_started_at: string | null;
  deletion_worker_lease_until: string | null;
  user_id: string;
};

type BackendState = {
  lifecycle: LifecycleFixture;
  serverNow: string;
  syncMode: 'online' | 'offline' | 'expired';
  offlineSyncAttempts: number;
  expiredSyncMovementIds: string[];
};

async function installSupabaseMock(page: Page): Promise<BackendState> {
  const state: BackendState = {
    lifecycle: {
      user_id: ownerId,
      deletion_requested_at: null,
      deletion_due_at: null,
      deletion_canceled_at: null,
      deletion_started_at: null,
      deletion_worker_lease_until: null,
    },
    serverNow: startTime,
    syncMode: 'online',
    offlineSyncAttempts: 0,
    expiredSyncMovementIds: [],
  };

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
      const user = createAuthUser(email);
      const accessToken = `header.${Buffer.from(
        JSON.stringify({ sub: ownerId, exp: expiresAt }),
      ).toString('base64url')}.signature`;

      await respond({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: expiresAt - Math.floor(Date.parse(startTime) / 1000),
        expires_at: expiresAt,
        refresh_token: `refresh-${ownerId}`,
        user,
      });
      return;
    }

    if (url.pathname === '/auth/v1/user') {
      await respond(createAuthUser('deletion-owner@example.invalid'));
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (url.pathname === '/rest/v1/categories' && request.method() === 'GET') {
      await respond([
        {
          id: categoryId,
          name: 'Food',
          source: 'default',
          archived_at: null,
          created_at: startTime,
          updated_at: startTime,
        },
      ]);
      return;
    }

    if (
      (url.pathname === '/rest/v1/financial_accounts' ||
        url.pathname === '/rest/v1/movements' ||
        url.pathname === '/rest/v1/refunds') &&
      request.method() === 'GET'
    ) {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/account_lifecycle' && request.method() === 'GET') {
      await respond([state.lifecycle]);
      return;
    }

    if (url.pathname === '/rest/v1/rpc/account_sync_allowed' && request.method() === 'POST') {
      const expired =
        Boolean(state.lifecycle.deletion_requested_at) &&
        !state.lifecycle.deletion_canceled_at &&
        Boolean(state.lifecycle.deletion_due_at) &&
        Date.parse(state.serverNow) >= Date.parse(state.lifecycle.deletion_due_at ?? '');
      await respond(!expired);
      return;
    }

    if (url.pathname === '/rest/v1/rpc/request_account_deletion' && request.method() === 'POST') {
      if (state.lifecycle.deletion_requested_at && !state.lifecycle.deletion_canceled_at) {
        await respond(state.lifecycle);
        return;
      }

      const requestedAt = state.serverNow;
      const dueAt = new Date(Date.parse(requestedAt) + 30 * 24 * 60 * 60 * 1000).toISOString();
      state.lifecycle = {
        ...state.lifecycle,
        deletion_requested_at: requestedAt,
        deletion_due_at: dueAt,
        deletion_canceled_at: null,
        deletion_started_at: null,
      };
      await respond(state.lifecycle);
      return;
    }

    if (url.pathname === '/rest/v1/rpc/cancel_account_deletion' && request.method() === 'POST') {
      if (
        !state.lifecycle.deletion_due_at ||
        state.lifecycle.deletion_canceled_at ||
        Date.parse(state.serverNow) >= Date.parse(state.lifecycle.deletion_due_at)
      ) {
        await respond({ code: '22023', message: 'Deletion request is not cancellable.' }, 400);
        return;
      }

      state.lifecycle = { ...state.lifecycle, deletion_canceled_at: state.serverNow };
      await respond(state.lifecycle);
      return;
    }

    if (url.pathname === '/rest/v1/rpc/apply_movement_change' && request.method() === 'POST') {
      const input = request.postDataJSON() as { p_movement_id: string };
      if (state.syncMode === 'offline') {
        state.offlineSyncAttempts += 1;
        await route.abort('failed');
        return;
      }
      if (state.syncMode === 'expired') {
        state.expiredSyncMovementIds.push(input.p_movement_id);
        await respond({ status: 'blocked' });
        return;
      }
    }

    await respond({ message: `Unhandled E2E request: ${request.method()} ${url.pathname}` }, 404);
  });

  return state;
}

function createAuthUser(email: string) {
  return {
    id: ownerId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: startTime,
    updated_at: startTime,
    email_confirmed_at: startTime,
  };
}

async function signUp(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await page.getByLabel('Correo electrónico').fill('deletion-owner@example.invalid');
  await page.getByLabel('Contraseña').fill('deletion-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await expect(
    page.getByLabel('Categoría', { exact: true }).getByRole('option', { name: 'Food' }),
  ).toBeAttached();
}

function rowForNote(page: Page, note: string) {
  return page
    .getByRole('list', { name: 'Historial de movimientos' })
    .getByRole('listitem')
    .filter({ hasText: note });
}

async function submitMovement(page: Page, amount: string, note: string) {
  const movementDialog = page.getByRole('dialog', { name: 'Registrar un movimiento' });
  if ((await movementDialog.count()) === 0) {
    await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  }
  await expect(movementDialog).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registrar un movimiento' })).toBeVisible();
  await page.getByLabel('Importe').fill(amount);
  await page.getByLabel('Categoría', { exact: true }).selectOption(categoryId);
  await page.getByLabel('Nota (opcional)').fill(note);
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
  await expect(movementDialog).toHaveCount(0);
}

test('warns, cancels during grace, then purges pending sync at expiry', async ({ page }) => {
  await page.clock.install({ time: new Date(startTime) });
  const backend = await installSupabaseMock(page);
  await signUp(page);

  backend.syncMode = 'offline';
  await submitMovement(page, '25.00', 'Pending expense one');
  await submitMovement(page, '10.00', 'Pending expense two');
  await expect(rowForNote(page, 'Pending expense one')).toBeVisible();
  await expect(rowForNote(page, 'Pending expense two')).toBeVisible();
  expect(backend.offlineSyncAttempts).toBe(2);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Mi perfil' })).toBeVisible();
  await page.getByRole('button', { name: 'Solicitar eliminación' }).click();

  const confirmation = page.getByRole('dialog', { name: 'Confirmar eliminación de cuenta' });
  await expect(confirmation).toContainText('dispositivo que no vuelva a conectarse');
  await confirmation.getByRole('button', { name: 'Confirmar solicitud' }).click();
  await expect(page.getByText('26 de octubre de 2026')).toBeVisible();
  await expect(page.getByText('Eliminación solicitada')).toBeVisible();

  await page.getByRole('button', { name: 'Cancelar solicitud' }).click();
  expect(backend.lifecycle.deletion_canceled_at).toBe(startTime);
  await expect(page.getByRole('button', { name: 'Solicitar eliminación' })).toBeVisible();

  await page.getByRole('button', { name: 'Solicitar eliminación' }).click();
  await page
    .getByRole('dialog', { name: 'Confirmar eliminación de cuenta' })
    .getByRole('button', { name: 'Confirmar solicitud' })
    .click();
  await expect(page.getByText('Eliminación solicitada')).toBeVisible();
  const dueAt = backend.lifecycle.deletion_due_at;
  if (!dueAt) {
    throw new Error('The renewed deletion request did not return a deadline.');
  }
  expect(dueAt).toBe('2026-10-26T12:00:00.000Z');

  backend.serverNow = dueAt;
  await page.goto('/settings');
  await expect(page.getByText('La fecha límite venció')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar solicitud' })).toHaveCount(0);

  backend.syncMode = 'expired';
  await page.goto('/');
  await expect.poll(() => backend.expiredSyncMovementIds.length).toBe(1);
  await expect(rowForNote(page, 'Pending expense one')).toHaveCount(0);
  await expect(rowForNote(page, 'Pending expense two')).toHaveCount(0);
  await expect(page.getByText(/pendientes se eliminaron de este dispositivo/i)).toBeVisible();

  await page.reload();
  expect(backend.expiredSyncMovementIds).toHaveLength(1);
});
