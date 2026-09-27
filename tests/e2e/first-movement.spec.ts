import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';

const ownerId = '00000000-0000-0000-0000-000000000001';
const foodCategoryId = '10000000-0000-0000-0000-000000000001';
const customCategoryId = '10000000-0000-0000-0000-000000000011';
const timestamp = '2026-09-26T12:00:00.000Z';

function getIsoWeekValue(date: Date): string {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
  const weekYear = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() + 3 - ((firstThursday.getUTCDay() + 6) % 7));
  const week = Math.round((thursday.getTime() - firstThursday.getTime()) / 604_800_000) + 1;

  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

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

    if (url.pathname === '/rest/v1/recurring_movements' && request.method() === 'GET') {
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
  await expect(page.locator('.session-strip')).toHaveCSS('position', 'sticky');
  const initialViewport = page.viewportSize();
  if (initialViewport && initialViewport.width > 760) {
    await expect(page.getByRole('group', { name: 'Período de categorías' })).toBeVisible();
    const desktopBalance = await page
      .getByRole('region', { name: 'Balance de la cuenta seleccionada' })
      .boundingBox();
    const desktopActions = await page.locator('.dashboard-actions__list').boundingBox();
    const desktopHistoryToolbar = await page.locator('.movement-history__controls').boundingBox();
    const desktopHistoryViews = await page.locator('.movement-history__views').boundingBox();
    const desktopCategoryPeriod = await page
      .locator('.movement-history__category-period')
      .boundingBox();
    const desktopPeriodViews = await page.locator('.movement-history__period-views').boundingBox();
    const desktopWeekBounds = await page
      .getByRole('group', { name: 'Período de categorías' })
      .getByRole('button', { name: 'Semana' })
      .boundingBox();
    const desktopMonthBounds = await page
      .getByRole('group', { name: 'Período de categorías' })
      .getByRole('button', { name: 'Mes' })
      .boundingBox();
    const desktopMonthInputBounds = await page.getByLabel('Mes de categorías').boundingBox();
    if (
      !desktopBalance ||
      !desktopActions ||
      !desktopHistoryToolbar ||
      !desktopHistoryViews ||
      !desktopCategoryPeriod ||
      !desktopPeriodViews ||
      !desktopWeekBounds ||
      !desktopMonthBounds ||
      !desktopMonthInputBounds
    ) {
      throw new Error('The desktop overview sections must have visible bounds.');
    }
    expect(desktopActions.x).toBeGreaterThan(desktopBalance.x);
    expect(
      Math.abs(
        desktopActions.y +
          desktopActions.height / 2 -
          (desktopBalance.y + desktopBalance.height / 2),
      ),
    ).toBeLessThanOrEqual(1);
    expect(desktopHistoryViews.x).toBeLessThan(desktopCategoryPeriod.x);
    expect(desktopCategoryPeriod.x + desktopCategoryPeriod.width).toBeCloseTo(
      desktopHistoryToolbar.x + desktopHistoryToolbar.width,
      0,
    );
    expect(desktopWeekBounds.x).toBeLessThan(desktopMonthBounds.x);
    expect(Math.abs(desktopWeekBounds.y - desktopMonthBounds.y)).toBeLessThanOrEqual(1);
    expect(desktopMonthInputBounds.y).toBeGreaterThan(desktopPeriodViews.y);
    expect(
      Math.abs(
        desktopMonthInputBounds.x +
          desktopMonthInputBounds.width -
          (desktopCategoryPeriod.x + desktopCategoryPeriod.width),
      ),
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Nuevo movimiento' })).toBeVisible();
  const dashboardDocumentWidth = await page
    .locator('html')
    .evaluate((element) => element.scrollWidth);
  expect(dashboardDocumentWidth).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Nuevo movimiento' }).click();
  const movementDialog = page.getByRole('dialog', { name: 'Registrar un movimiento' });
  await expect(movementDialog).toBeVisible();
  await expect(movementDialog).toHaveCSS('overflow-x', 'hidden');
  const dateInput = page.getByLabel('Fecha');
  const dialogBounds = await movementDialog.boundingBox();
  const dateBounds = await dateInput.boundingBox();
  if (!dialogBounds || !dateBounds) {
    throw new Error('The movement dialog and date input must have visible bounds.');
  }
  expect(dateBounds.x).toBeGreaterThanOrEqual(dialogBounds.x);
  expect(dateBounds.x + dateBounds.width).toBeLessThanOrEqual(dialogBounds.x + dialogBounds.width);
  const today = new Date();
  const proposedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await expect(dateInput).toHaveValue(proposedDate);

  await page.getByRole('radio', { name: 'Recurrente' }).check();
  await page.getByRole('checkbox', { name: 'Activar avisos' }).check();
  const reminderLead = page.getByLabel('Avisar antes');
  await expect(reminderLead).toHaveValue('7');
  await expect(reminderLead.locator('option')).toHaveText([
    '1 día antes',
    '3 días antes',
    '1 semana antes',
    '2 semanas antes',
    '1 mes antes',
  ]);
  const onceReminder = page.getByRole('radio', { name: 'Una vez, al iniciar el plazo' });
  const dailyReminder = page.getByRole('radio', { name: 'Cada día hasta el vencimiento' });
  await onceReminder.check();
  await expect(onceReminder).toBeChecked();
  await dailyReminder.check();
  await expect(dailyReminder).toBeChecked();
  await page.getByRole('radio', { name: 'Una vez', exact: true }).check();

  const correctedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const correctedDateValue = `${correctedDate.getFullYear()}-${String(correctedDate.getMonth() + 1).padStart(2, '0')}-${String(correctedDate.getDate()).padStart(2, '0')}`;
  await dateInput.fill(correctedDateValue);
  await page.getByLabel('Importe').fill('1250.50');
  await page.getByLabel('Categoría', { exact: true }).selectOption(foodCategoryId);
  await page.getByRole('button', { name: 'Registrar movimiento' }).click();

  const mobileDocumentWidth = await page.locator('html').evaluate((element) => element.scrollWidth);
  expect(mobileDocumentWidth).toBeLessThanOrEqual(390);
  const historyViews = page.getByRole('group', { name: 'Vista del historial' });
  await expect(historyViews.getByRole('button', { name: 'Por categoría' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#history-kind-filter')).toHaveCount(0);
  const historyViewsBounds = await historyViews.boundingBox();
  const historySectionBounds = await page.locator('.movement-history').boundingBox();
  const generalViewBounds = await historyViews
    .getByRole('button', { name: 'General' })
    .boundingBox();
  const categoryViewBounds = await historyViews
    .getByRole('button', { name: 'Por categoría' })
    .boundingBox();
  if (!historyViewsBounds || !historySectionBounds || !generalViewBounds || !categoryViewBounds) {
    throw new Error('The history switch and its options must have visible bounds.');
  }
  expect(Math.abs(historyViewsBounds.width - historySectionBounds.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(generalViewBounds.width - categoryViewBounds.width)).toBeLessThanOrEqual(1);
  await historyViews.getByRole('button', { name: 'Por categoría' }).click();
  const categoryHistory = page.getByRole('list', { name: 'Movimientos por categoría' });
  const foodGroup = categoryHistory.locator('li.movement-category').filter({
    hasText: 'Alimentación',
  });
  await expect(foodGroup).toContainText('ARS 1.250,50');
  const currentMonthValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  await expect(page.getByLabel('Mes de categorías')).toHaveValue(currentMonthValue);
  const categoryPeriod = page.getByRole('group', { name: 'Período de categorías' });
  await categoryPeriod.getByRole('button', { name: 'Semana' }).click();
  const categoryWeekInput = page.getByLabel('Semana de categorías');
  await categoryWeekInput.fill(getIsoWeekValue(correctedDate));
  await expect(foodGroup).toContainText('ARS 1.250,50');
  await categoryPeriod.getByRole('button', { name: 'Mes' }).click();
  await expect(page.getByLabel('Mes de categorías')).toHaveValue(currentMonthValue);
  await page.getByRole('button', { name: 'Ver todos los movimientos' }).click();
  const fullHistory = page.getByRole('dialog', { name: 'Todos los movimientos' });
  await expect(fullHistory).toBeVisible();
  const fullHistoryKindFilter = fullHistory.getByLabel('Tipo de movimiento');
  await expect(fullHistoryKindFilter).toHaveValue('all');
  await fullHistoryKindFilter.selectOption('income');
  await expect(fullHistory.locator('.movement-history-day')).toHaveCount(0);
  await fullHistoryKindFilter.selectOption('all');
  await expect(fullHistory.locator('.movement-history-day')).toHaveCount(1);
  await expect(fullHistory.locator('.movement-history-day h3 time')).toHaveAttribute(
    'datetime',
    correctedDateValue,
  );
  await expect(fullHistory.locator('.movement-history-day')).toContainText('ARS 1.250,50');
  await fullHistory.getByRole('button', { name: 'Cerrar historial' }).click();
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
  await expect(page.locator('.session-strip')).toHaveCSS('position', 'sticky');
  await page
    .getByRole('group', { name: 'Vista del historial' })
    .getByRole('button', { name: 'General' })
    .click();
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

  await page.getByRole('link', { name: 'Configuración', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible();
  await page.getByRole('link', { name: /Apariencia/ }).click();
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible();
  const appIconSettings = page.getByRole('group', { name: 'Icono de inicio' });
  await expect
    .poll(() =>
      appIconSettings
        .locator('img')
        .evaluateAll((images) => images.map((image) => (image as HTMLImageElement).naturalWidth)),
    )
    .toEqual([180, 180]);
  await appIconSettings.getByRole('radio', { name: 'Claro' }).check();
  expect(await page.evaluate(() => localStorage.getItem('mave.app-icon'))).toBe('light');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    './icons/apple-touch-icon-light.png',
  );
  await appIconSettings.getByRole('radio', { name: 'Oscuro' }).check();
  expect(await page.evaluate(() => localStorage.getItem('mave.app-icon'))).toBe('dark');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    './icons/apple-touch-icon-dark.png',
  );
  await expect(appIconSettings.getByText(/elimina Mave.*vuelve a añadirla/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Apariencia' })).toBeVisible();
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    'href',
    './icons/apple-touch-icon-dark.png',
  );
  await expect(
    page.getByRole('group', { name: 'Icono de inicio' }).getByRole('radio', { name: 'Oscuro' }),
  ).toBeChecked();

  const appearanceSettings = page.getByRole('group', { name: 'Apariencia' });
  await appearanceSettings.getByRole('radio', { name: 'Clara' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await appearanceSettings.getByRole('radio', { name: 'Oscura' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('mave.appearance'))).toBe('dark');
  const navigationSettings = page.getByRole('group', { name: 'Barra de navegación' });
  const settingsViewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await navigationSettings.getByRole('radio', { name: 'Flotante' }).check();
  await expect(page.locator('.mobile-navigation')).toHaveCSS('border-radius', '999px');
  expect(await page.evaluate(() => localStorage.getItem('mave.mobile-navigation-style'))).toBe(
    'floating',
  );
  await navigationSettings.getByRole('radio', { name: 'Normal' }).check();
  if (settingsViewport) {
    await page.setViewportSize(settingsViewport);
  }
  const movementTypeSettings = page.getByRole('group', {
    name: 'Formato del tipo de movimiento',
  });
  await movementTypeSettings.getByRole('radio', { name: 'Signos: + / -' }).check();
  expect(await page.evaluate(() => localStorage.getItem('mave.movement-type-display'))).toBe(
    'symbols',
  );

  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  const categoriesPanel = page.locator('details.accounts-categories-panel');
  await expect(categoriesPanel).not.toHaveAttribute('open', '');
  await categoriesPanel.locator('summary').click();
  await expect(categoriesPanel).toHaveAttribute('open', '');
  await categoriesPanel.getByRole('button', { name: 'Gestionar categorías' }).click();
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
  await page
    .getByRole('group', { name: 'Vista del historial' })
    .getByRole('button', { name: 'General' })
    .click();
  await expect(movementAfterReload).toContainText('Alimentación');
  await expect(movementAfterReload.getByRole('img', { name: 'Egreso' })).toHaveText('-');
  await page.reload();
  await page
    .getByRole('group', { name: 'Vista del historial' })
    .getByRole('button', { name: 'General' })
    .click();
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
  await page
    .getByRole('group', { name: 'Vista del historial' })
    .getByRole('button', { name: 'General' })
    .click();

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
