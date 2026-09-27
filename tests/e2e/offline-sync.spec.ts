import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const ownerOne = '00000000-0000-0000-0000-000000000001';
const ownerTwo = '00000000-0000-0000-0000-000000000002';
const categoryId = '10000000-0000-0000-0000-000000000001';
const timestamp = '2026-09-26T12:00:00.000Z';

type CategoryFixture = {
  id: string;
  name: string;
  source: 'default' | 'custom';
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type MovementPayload = {
  amount: string;
  category_id: string;
  currency: 'ARS' | 'USD';
  financial_account_id: string | null;
  kind: 'income' | 'expense';
  note: string | null;
  occurred_on: string;
};

type MovementFixture = MovementPayload & {
  id: string;
  user_id: string;
  amount_text: string;
  version: number;
  client_operation_id: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConflictRevisionFixture = MovementPayload & {
  amount_text: string;
  id: string;
  user_id: string;
  conflict_id: string;
  source: 'server' | 'client';
  action: 'create' | 'update' | 'delete';
  expected_version: number;
};

type ConflictFixture = {
  id: string;
  user_id: string;
  movement_id: string;
  status: 'open' | 'resolved';
  chosen_revision_id: string | null;
  opened_at: string;
  resolved_at: string | null;
};

type ApplyRequest = {
  p_action: 'create' | 'update' | 'delete';
  p_operation_id: string;
  p_movement_id: string;
  p_expected_version: number | null;
  p_payload: MovementPayload | null;
};

type ApplyResult = {
  status: 'applied' | 'conflict';
  movement: MovementFixture;
  conflict_id: string | null;
  revisions: ConflictRevisionFixture[];
};

type BackendState = {
  dataAvailable: boolean;
  dropNextMovementResponse: boolean;
  movementsByOwner: Map<string, MovementFixture[]>;
  operations: Map<string, ApplyResult>;
  conflicts: Map<string, ConflictFixture>;
  revisions: Map<string, ConflictRevisionFixture[]>;
  resolutions: Map<string, { conflict_id: string; movement: MovementFixture; status: string }>;
  requests: string[];
  syncRequestOwners: string[];
  committedOperationIds: Set<string>;
};

function createCategories(): CategoryFixture[] {
  return [
    {
      id: categoryId,
      name: 'Alimentación',
      source: 'default',
      archived_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];
}

async function installSupabaseMock(page: Page): Promise<BackendState> {
  const state: BackendState = {
    dataAvailable: true,
    dropNextMovementResponse: false,
    movementsByOwner: new Map([
      [ownerOne, []],
      [ownerTwo, []],
    ]),
    operations: new Map(),
    conflicts: new Map(),
    revisions: new Map(),
    resolutions: new Map(),
    requests: [],
    syncRequestOwners: [],
    committedOperationIds: new Set(),
  };

  await page.route('http://127.0.0.1:54321/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    state.requests.push(`${request.method()} ${url.pathname}`);
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

    if (url.pathname.startsWith('/rest/v1/') && !state.dataAvailable) {
      await route.abort('failed');
      return;
    }

    if (url.pathname === '/auth/v1/signup') {
      const { email } = request.postDataJSON() as { email: string };
      const ownerId = email.includes('other') ? ownerTwo : ownerOne;
      const user = createAuthUser(ownerId, email);
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const accessToken = `header.${Buffer.from(
        JSON.stringify({ sub: ownerId, exp: expiresAt }),
      ).toString('base64url')}.signature`;

      await respond({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: expiresAt,
        refresh_token: `refresh-${ownerId}`,
        user,
      });
      return;
    }

    if (url.pathname === '/auth/v1/user') {
      const ownerId = requestOwnerId(request);
      await respond(
        createAuthUser(
          ownerId,
          ownerId === ownerTwo ? 'other@example.invalid' : 'owner@example.invalid',
        ),
      );
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    const ownerId = requestOwnerId(request);

    if (url.pathname === '/rest/v1/categories' && request.method() === 'GET') {
      await respond(createCategories());
      return;
    }

    if (url.pathname === '/rest/v1/financial_accounts' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/refunds' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/movements' && request.method() === 'GET') {
      await respond(
        (state.movementsByOwner.get(ownerId) ?? []).filter(
          (movement) => movement.deleted_at === null,
        ),
      );
      return;
    }

    if (url.pathname === '/rest/v1/movement_conflicts' && request.method() === 'GET') {
      await respond(
        [...state.conflicts.values()].filter(
          (conflict) => conflict.user_id === ownerId && conflict.status === 'open',
        ),
      );
      return;
    }

    if (url.pathname === '/rest/v1/movement_conflict_revisions' && request.method() === 'GET') {
      await respond(
        [...state.revisions.values()].flat().filter((revision) => revision.user_id === ownerId),
      );
      return;
    }

    if (url.pathname === '/rest/v1/rpc/apply_movement_change' && request.method() === 'POST') {
      const input = request.postDataJSON() as ApplyRequest;
      state.syncRequestOwners.push(ownerId);
      const operationKey = `${ownerId}:${input.p_operation_id}`;
      let result = state.operations.get(operationKey);

      if (!result) {
        result = applyMovement(state, ownerId, input);
        state.operations.set(operationKey, result);
        state.committedOperationIds.add(input.p_operation_id);
      }

      if (state.dropNextMovementResponse) {
        state.dropNextMovementResponse = false;
        await route.abort('failed');
        return;
      }

      await respond(result);
      return;
    }

    if (url.pathname === '/rest/v1/rpc/resolve_movement_conflict' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        p_operation_id: string;
        p_conflict_id: string;
        p_revision_id: string;
      };
      const resolutionKey = `${ownerId}:${input.p_operation_id}`;
      let result = state.resolutions.get(resolutionKey);

      if (!result) {
        const conflict = state.conflicts.get(input.p_conflict_id);
        const revisions = state.revisions.get(input.p_conflict_id) ?? [];
        const chosen = revisions.find((revision) => revision.id === input.p_revision_id);
        const movement = (state.movementsByOwner.get(ownerId) ?? []).find(
          (item) => item.id === conflict?.movement_id,
        );

        if (!conflict || !chosen || !movement) {
          await respond({ message: 'Conflict is unavailable.' }, 404);
          return;
        }

        if (chosen.source === 'client') {
          Object.assign(movement, chosen, {
            amount_text: normalizeAmount(chosen.amount),
            version: movement.version + 1,
            client_operation_id: input.p_operation_id,
            updated_at: timestamp,
          });
        }
        conflict.status = 'resolved';
        conflict.chosen_revision_id = chosen.id;
        conflict.resolved_at = timestamp;
        result = { status: 'resolved', conflict_id: conflict.id, movement };
        state.resolutions.set(resolutionKey, result);
      }

      await respond(result);
      return;
    }

    await respond({ message: `Unhandled E2E request: ${request.method()} ${url.pathname}` }, 404);
  });

  return state;
}

function applyMovement(state: BackendState, ownerId: string, input: ApplyRequest): ApplyResult {
  const ownerMovements = state.movementsByOwner.get(ownerId) ?? [];
  const current = ownerMovements.find((movement) => movement.id === input.p_movement_id);

  if (input.p_action === 'create') {
    const payload = input.p_payload;
    if (!payload) {
      throw new Error('Create payload is required.');
    }

    const movement = {
      ...payload,
      id: input.p_movement_id,
      user_id: ownerId,
      amount_text: normalizeAmount(payload.amount),
      version: 1,
      client_operation_id: input.p_operation_id,
      deleted_at: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    ownerMovements.push(movement);
    state.movementsByOwner.set(ownerId, ownerMovements);
    return { status: 'applied', movement, conflict_id: null, revisions: [] };
  }

  if (!current) {
    throw new Error('Movement is unavailable.');
  }

  if (current.version !== input.p_expected_version) {
    const conflictId = '50000000-0000-0000-0000-000000000001';
    const serverRevision = createRevision(conflictId, ownerId, 'server', current, current.version);
    const clientRevision = createRevision(
      conflictId,
      ownerId,
      'client',
      input.p_payload ?? current,
      input.p_expected_version ?? current.version,
    );
    const conflict: ConflictFixture = {
      id: conflictId,
      user_id: ownerId,
      movement_id: current.id,
      status: 'open',
      chosen_revision_id: null,
      opened_at: timestamp,
      resolved_at: null,
    };
    const revisions = [serverRevision, clientRevision];
    state.conflicts.set(conflict.id, conflict);
    state.revisions.set(conflict.id, revisions);
    return { status: 'conflict', movement: current, conflict_id: conflict.id, revisions };
  }

  if (input.p_action === 'delete') {
    current.deleted_at = timestamp;
    current.version += 1;
    current.client_operation_id = input.p_operation_id;
    current.updated_at = timestamp;
  } else if (input.p_payload) {
    Object.assign(current, input.p_payload, {
      amount_text: normalizeAmount(input.p_payload.amount),
      version: current.version + 1,
      client_operation_id: input.p_operation_id,
      updated_at: timestamp,
    });
  }

  return { status: 'applied', movement: current, conflict_id: null, revisions: [] };
}

function createRevision(
  conflictId: string,
  ownerId: string,
  source: 'server' | 'client',
  payload: MovementPayload,
  expectedVersion: number,
): ConflictRevisionFixture {
  return {
    ...payload,
    amount_text: normalizeAmount(payload.amount),
    id:
      source === 'server'
        ? '51000000-0000-0000-0000-000000000001'
        : '51000000-0000-0000-0000-000000000002',
    user_id: ownerId,
    conflict_id: conflictId,
    source,
    action: 'update',
    expected_version: expectedVersion,
  };
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

function normalizeAmount(amount: string): string {
  return Number(amount).toFixed(2);
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

async function signUp(page: Page, email: string, backend: BackendState) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill('offline-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await expect(
    page.getByLabel('Categoría', { exact: true }).getByRole('option', { name: 'Alimentación' }),
    JSON.stringify(backend.requests),
  ).toBeAttached();
}

async function rowForNote(page: Page, note: string) {
  const generalView = page
    .getByRole('group', { name: 'Vista del historial' })
    .getByRole('button', { name: 'General' });
  if ((await generalView.getAttribute('aria-pressed')) !== 'true') {
    await generalView.click();
  }

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
  await page.getByLabel('Importe').fill(amount);
  await page.getByLabel('Categoría', { exact: true }).selectOption(categoryId);
  await page.getByLabel('Nota (opcional)').fill(note);
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();
}

test('keeps an offline movement after reload and retries an idempotent sync', async ({ page }) => {
  const backend = await installSupabaseMock(page);
  await signUp(page, 'offline-owner@example.invalid', backend);

  backend.dataAvailable = false;
  await submitMovement(page, '1250.50', 'Compra sin conexión');

  const firstRow = await rowForNote(page, 'Compra sin conexión');
  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByLabel('Estado de sincronización')).toHaveText(
    /Solo en este dispositivo|Reintento pendiente/,
  );

  await page.reload();
  const rowAfterOfflineReload = await rowForNote(page, 'Compra sin conexión');
  await expect(rowAfterOfflineReload).toBeVisible();
  await expect(rowAfterOfflineReload.getByLabel('Estado de sincronización')).toHaveText(
    'Reintento pendiente',
  );

  backend.dataAvailable = true;
  backend.dropNextMovementResponse = true;
  await page.reload();
  const rowAfterLostResponse = await rowForNote(page, 'Compra sin conexión');
  await expect(rowAfterLostResponse.getByLabel('Estado de sincronización')).toHaveText(
    'Reintento pendiente',
  );

  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const syncedRow = await rowForNote(page, 'Compra sin conexión');
  await expect(syncedRow.getByLabel('Estado de sincronización')).toHaveText('Sincronizado');
  await expect(
    page.getByRole('list', { name: 'Historial de movimientos' }).getByRole('listitem'),
  ).toHaveCount(1);
  expect(backend.committedOperationIds.size).toBe(1);
  expect(backend.movementsByOwner.get(ownerOne)).toHaveLength(1);
  expect(new Set(backend.syncRequestOwners)).toEqual(new Set([ownerOne]));
});

test('warns before logout and never exposes a pending movement to another account', async ({
  page,
}) => {
  const backend = await installSupabaseMock(page);
  await signUp(page, 'offline-owner@example.invalid', backend);
  backend.dataAvailable = false;
  await submitMovement(page, '75.00', 'Privado de la primera cuenta');
  await expect(await rowForNote(page, 'Privado de la primera cuenta')).toBeVisible();

  let logoutWarning = '';
  page.on('dialog', async (dialog) => {
    logoutWarning = dialog.message();
    await dialog.accept();
  });
  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
  await page.getByRole('link', { name: /Cuenta/ }).click();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Mave' })).toBeVisible();
  expect(logoutWarning).toContain('pendientes');

  backend.dataAvailable = true;
  await signUp(page, 'other-owner@example.invalid', backend);
  await page
    .getByRole('dialog', { name: 'Registrar un movimiento' })
    .getByRole('button', { name: 'Cerrar formulario' })
    .click();
  await expect(await rowForNote(page, 'Privado de la primera cuenta')).toHaveCount(0);
  expect(backend.syncRequestOwners).not.toContain(ownerTwo);
});

test('shows both conflict revisions and applies only the chosen movement', async ({ page }) => {
  const backend = await installSupabaseMock(page);
  await signUp(page, 'conflict-owner@example.invalid', backend);
  await submitMovement(page, '100.00', 'Gasto en conflicto');

  const movementRow = await rowForNote(page, 'Gasto en conflicto');
  await movementRow.locator('details').first().locator('summary').click();
  await expect(movementRow.getByLabel('Estado de sincronización')).toHaveText('Sincronizado');
  await movementRow.getByRole('button', { name: 'Editar movimiento' }).click();
  await page.getByLabel('Importe').fill('125.00');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(movementRow).toContainText('ARS 125,00');

  backend.dataAvailable = false;
  await movementRow.getByRole('button', { name: 'Editar movimiento' }).click();
  await page.getByLabel('Importe').fill('150.00');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(movementRow).toContainText('ARS 150,00');

  const canonical = backend.movementsByOwner.get(ownerOne)?.[0];
  if (!canonical) {
    throw new Error('The canonical movement fixture was not created.');
  }
  Object.assign(canonical, { amount: '140.00', amount_text: '140.00', version: 3 });

  backend.dataAvailable = true;
  await page.reload();
  const resolver = page.getByRole('region', { name: 'Conflicto de sincronización' });
  await expect(resolver).toBeVisible();
  await expect(resolver).toContainText('ARS 140,00');
  await expect(resolver).toContainText('ARS 150,00');

  await page.reload();
  const resolverAfterReload = page.getByRole('region', { name: 'Conflicto de sincronización' });
  await expect(resolverAfterReload).toBeVisible();
  await resolverAfterReload
    .getByRole('button', { name: 'Conservar versión del dispositivo' })
    .click();

  const resolvedRow = await rowForNote(page, 'Gasto en conflicto');
  await expect(resolvedRow).toContainText('ARS 150,00');
  await expect(resolvedRow.getByLabel('Estado de sincronización')).toHaveText('Sincronizado');
  expect(canonical.amount_text).toBe('150.00');
  expect(canonical.version).toBe(4);
});
