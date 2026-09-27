import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const ownerId = '00000000-0000-0000-0000-000000000001';
const foodCategoryId = '10000000-0000-0000-0000-000000000001';
const customCategoryId = '10000000-0000-0000-0000-000000000011';
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

test('registers a first movement, edits and deletes it, and manages categories', async ({
  page,
}) => {
  const defaultNames = [
    'Alimentación',
    'Vivienda',
    'Transporte',
    'Salud',
    'Educación',
    'Servicios',
    'Compras',
    'Entretenimiento',
    'Ingresos',
    'Otros',
  ];
  const categories: CategoryFixture[] = defaultNames.map((name, index) => ({
    id: `10000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
    name,
    source: 'default',
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }));
  const movements: MovementFixture[] = [];
  let movementSequence = 0;

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
        refresh_token: 'e2e-refresh-token',
        user,
      });
      return;
    }

    if (url.pathname === '/auth/v1/user') {
      await respond({
        id: ownerId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'mave-e2e@example.invalid',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        identities: [],
        created_at: timestamp,
        updated_at: timestamp,
      });
      return;
    }

    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (url.pathname === '/rest/v1/categories') {
      if (request.method() === 'GET') {
        await respond(categories);
        return;
      }

      const categoryId = url.searchParams.get('id')?.replace('eq.', '');
      if (request.method() === 'PATCH' && categoryId) {
        const category = categories.find((item) => item.id === categoryId);
        if (!category) {
          await respond({ message: 'Category not found' }, 404);
          return;
        }

        Object.assign(category, request.postDataJSON(), { updated_at: timestamp });
        await respond(category);
        return;
      }

      if (request.method() === 'POST') {
        const input = request.postDataJSON() as Omit<
          CategoryFixture,
          'id' | 'created_at' | 'updated_at' | 'archived_at'
        >;
        const category: CategoryFixture = {
          ...input,
          id: customCategoryId,
          archived_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        categories.push(category);
        await respond(category, 201);
        return;
      }
    }

    if (url.pathname === '/rest/v1/financial_accounts' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/transfers' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/refunds' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/movements') {
      if (request.method() === 'GET') {
        await respond(movements.filter((movement) => movement.deleted_at === null));
        return;
      }

      if (request.method() === 'POST') {
        movementSequence += 1;
        const input = request.postDataJSON() as Omit<
          MovementFixture,
          'id' | 'user_id' | 'version' | 'deleted_at' | 'created_at' | 'updated_at' | 'amount_text'
        >;
        const movement: MovementFixture = {
          ...input,
          amount_text: input.amount,
          id: `20000000-0000-0000-0000-${String(movementSequence).padStart(12, '0')}`,
          user_id: ownerId,
          version: 1,
          deleted_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        movements.push(movement);
        await respond(movement, 201);
        return;
      }

      if (request.method() === 'PATCH') {
        const movementId = url.searchParams.get('id')?.replace('eq.', '');
        const movement = movements.find((item) => item.id === movementId);
        if (!movement) {
          await respond({ message: 'Movement not found' }, 404);
          return;
        }

        const updates = request.postDataJSON() as Partial<MovementFixture>;
        Object.assign(movement, updates, {
          amount_text: updates.amount ?? movement.amount_text,
          updated_at: timestamp,
        });
        await respond(movement);
        return;
      }
    }

    await respond({ message: `Unhandled E2E request: ${request.method()} ${url.pathname}` }, 404);
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();
  await page.getByLabel('Correo electrónico').fill('mave-e2e@example.invalid');
  await page.getByLabel('Contraseña').fill('test-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();

  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  const initialViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Nuevo movimiento' })).toBeVisible();
  const dashboardDocumentWidth = await page
    .locator('html')
    .evaluate((element) => element.scrollWidth);
  expect(dashboardDocumentWidth).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await expect(page.getByRole('dialog', { name: 'Registrar un movimiento' })).toBeVisible();
  const dateInput = page.getByLabel('Fecha');
  const today = new Date();
  const proposedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await expect(dateInput).toHaveValue(proposedDate);

  const correctedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const correctedDateValue = `${correctedDate.getFullYear()}-${String(correctedDate.getMonth() + 1).padStart(2, '0')}-${String(correctedDate.getDate()).padStart(2, '0')}`;
  await dateInput.fill(correctedDateValue);
  await page.getByLabel('Importe').fill('1250.50');
  await page.getByLabel('Categoría', { exact: true }).selectOption(foodCategoryId);
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();

  const mobileDocumentWidth = await page.locator('html').evaluate((element) => element.scrollWidth);
  expect(mobileDocumentWidth).toBeLessThanOrEqual(390);
  const historyViews = page.getByRole('group', { name: 'Vista del historial' });
  await historyViews.getByRole('button', { name: 'Por categoría' }).click();
  const categoryHistory = page.getByRole('list', { name: 'Movimientos por categoría' });
  const foodGroup = categoryHistory.locator('li.movement-category').filter({
    hasText: 'Alimentación',
  });
  await expect(foodGroup).toContainText('ARS 1.250,50');
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    390,
  );
  const foodGroupToggle = foodGroup.getByRole('button');
  await foodGroupToggle.click();
  await expect(foodGroupToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(foodGroup.locator('.movement-category__entries')).toBeVisible();
  await historyViews.getByRole('button', { name: 'General' }).click();
  if (initialViewport) {
    await page.setViewportSize(initialViewport);
  }

  const movementHistory = page.getByRole('list', { name: 'Historial de movimientos' });
  const firstMovement = movementHistory.getByRole('listitem').filter({ hasText: 'Alimentación' });
  await expect(firstMovement).toContainText('ARS 1.250,50');
  await expect(firstMovement.locator('time')).toHaveAttribute('datetime', correctedDateValue);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
  const movementAfterReload = movementHistory
    .getByRole('listitem')
    .filter({ hasText: 'Alimentación' });
  await expect(movementAfterReload).toContainText('ARS 1.250,50');
  await expect(movementAfterReload.getByRole('img', { name: 'Egreso' })).toHaveText('Egreso');
  await movementAfterReload.locator('details').first().locator('summary').click();
  await movementAfterReload.getByRole('button', { name: 'Editar movimiento' }).click();
  await page.getByLabel('Importe').fill('1500.75');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(movementAfterReload).toContainText('ARS 1.500,75');

  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  const appearanceSettings = page.getByRole('group', { name: 'Apariencia' });
  await appearanceSettings.getByRole('radio', { name: 'Clara' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await appearanceSettings.getByRole('radio', { name: 'Oscura' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('mave.appearance'))).toBe('dark');
  const navigationSettings = page.getByRole('group', { name: 'Barra de navegación' });
  await navigationSettings.getByRole('radio', { name: 'Flotante' }).check();
  expect(await page.evaluate(() => localStorage.getItem('mave.mobile-navigation-style'))).toBe(
    'floating',
  );
  await navigationSettings.getByRole('radio', { name: 'Normal' }).check();
  const movementTypeSettings = page.getByRole('group', {
    name: 'Formato del tipo de movimiento',
  });
  await movementTypeSettings.getByRole('radio', { name: 'Signos: + / -' }).check();
  expect(await page.evaluate(() => localStorage.getItem('mave.movement-type-display'))).toBe(
    'symbols',
  );

  await page.getByRole('button', { name: 'Gestionar categorías' }).click();
  const categoryManager = page.getByRole('region', { name: 'Gestionar categorías' });
  await categoryManager.getByLabel('Nueva categoría').fill('Mascotas');
  await categoryManager.getByRole('button', { name: 'Agregar categoría' }).click();
  const customCategory = categoryManager.getByRole('listitem').filter({ hasText: 'Mascotas' });
  await customCategory.getByLabel('Nombre de categoría').fill('Animales');
  await customCategory.getByRole('button', { name: 'Guardar nombre' }).click();
  const renamedCategory = categoryManager.getByRole('listitem').filter({ hasText: 'Animales' });
  await expect(renamedCategory).toContainText('Animales');

  const foodCategory = categoryManager.getByRole('listitem').filter({ hasText: 'Alimentación' });
  await foodCategory.getByRole('button', { name: 'Archivar' }).click();
  await expect(foodCategory).toContainText('Archivada');
  await page.getByRole('button', { name: 'Cerrar categorías' }).click();
  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(movementAfterReload).toContainText('Alimentación');
  await expect(movementAfterReload.getByRole('img', { name: 'Egreso' })).toHaveText('-');
  await page.reload();
  const persistedMovement = page
    .getByRole('list', { name: 'Historial de movimientos' })
    .getByRole('listitem')
    .filter({ hasText: 'Alimentación' });
  await expect(persistedMovement.getByRole('img', { name: 'Egreso' })).toHaveText('-');
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  await expect(
    page.getByLabel('Categoría', { exact: true }).getByRole('option', { name: 'Alimentación' }),
  ).toHaveCount(0);

  await page.getByLabel('Importe').fill('200');
  await page.getByLabel('Categoría', { exact: true }).selectOption(customCategoryId);
  await page.getByLabel('Nota (opcional)').fill('Compra con tarjeta');
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();

  const cardExpense = movementHistory
    .getByRole('listitem')
    .filter({ hasText: 'Compra con tarjeta' });
  await expect(cardExpense).toContainText('Animales');
  await cardExpense.locator('details').first().locator('summary').click();
  page.on('dialog', (dialog) => dialog.accept());
  await cardExpense.getByRole('button', { name: 'Eliminar movimiento' }).click();
  await expect(cardExpense).toHaveCount(0);
  await expect(movementAfterReload).toBeVisible();
});
