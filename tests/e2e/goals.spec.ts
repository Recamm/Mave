import { Buffer } from 'node:buffer';
import { expect, test, type Page } from '@playwright/test';

const ownerId = '00000000-0000-0000-0000-000000000051';
const categoryId = '10000000-0000-0000-0000-000000000051';
const timestamp = '2026-09-26T12:00:00.000Z';

type GoalFixture = {
  created_at: string;
  currency: 'ARS' | 'USD';
  id: string;
  name: string;
  target_amount: string;
  target_amount_text: string;
  target_date: string | null;
  updated_at: string;
  user_id: string;
};

type ContributionFixture = {
  amount: string;
  amount_text: string;
  contributed_on: string;
  created_at: string;
  goal_id: string;
  id: string;
  user_id: string;
};

type BackendState = {
  accountWrites: number;
  contributionPayloads: Record<string, unknown>[];
  contributions: ContributionFixture[];
  goals: GoalFixture[];
  movementWrites: number;
};

async function installSupabaseMock(page: Page): Promise<BackendState> {
  const state: BackendState = {
    accountWrites: 0,
    contributionPayloads: [],
    contributions: [],
    goals: [],
    movementWrites: 0,
  };
  let goalSequence = 0;
  let contributionSequence = 0;

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
      const user = createAuthUser(email);
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
      await respond(createAuthUser('goals-owner@example.invalid'));
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
          name: 'Alimentación',
          source: 'default',
          archived_at: null,
          created_at: timestamp,
          updated_at: timestamp,
        },
      ]);
      return;
    }

    if (url.pathname === '/rest/v1/financial_accounts') {
      if (request.method() !== 'GET') {
        state.accountWrites += 1;
        await respond({ message: 'Goal flow must not write financial accounts.' }, 500);
        return;
      }

      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/movements') {
      if (request.method() !== 'GET') {
        state.movementWrites += 1;
        await respond({ message: 'Goal flow must not write movements.' }, 500);
        return;
      }

      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/refunds' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/transfers' && request.method() === 'GET') {
      await respond([]);
      return;
    }

    if (url.pathname === '/rest/v1/goals' && request.method() === 'GET') {
      await respond(
        state.goals
          .filter((goal) => goal.user_id === ownerId)
          .sort((left, right) => left.created_at.localeCompare(right.created_at)),
      );
      return;
    }

    if (url.pathname === '/rest/v1/goals' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        currency: 'ARS' | 'USD';
        name: string;
        target_amount: string;
        target_date: string | null;
      };
      goalSequence += 1;
      const goal: GoalFixture = {
        ...input,
        id: `25000000-0000-0000-0000-${String(goalSequence).padStart(12, '0')}`,
        target_amount_text: input.target_amount,
        user_id: ownerId,
        created_at: timestamp,
        updated_at: timestamp,
      };
      state.goals.push(goal);
      await respond(goal, 201);
      return;
    }

    if (url.pathname === '/rest/v1/goals' && request.method() === 'DELETE') {
      const goalId = url.searchParams.get('id')?.replace(/^eq\./, '');
      const deletedGoal = state.goals.find((goal) => goal.id === goalId);
      if (!deletedGoal) {
        await respond({ message: 'Goal not found.' }, 404);
        return;
      }

      state.goals = state.goals.filter((goal) => goal.id !== goalId);
      state.contributions = state.contributions.filter(
        (contribution) => contribution.goal_id !== goalId,
      );
      await respond({ id: deletedGoal.id });
      return;
    }

    if (url.pathname === '/rest/v1/goal_contributions' && request.method() === 'GET') {
      await respond(state.contributions.filter((contribution) => contribution.user_id === ownerId));
      return;
    }

    if (url.pathname === '/rest/v1/goal_contributions' && request.method() === 'POST') {
      const input = request.postDataJSON() as {
        amount: string;
        contributed_on: string;
        goal_id: string;
      };
      state.contributionPayloads.push(input);
      contributionSequence += 1;
      const contribution: ContributionFixture = {
        ...input,
        id: `35000000-0000-0000-0000-${String(contributionSequence).padStart(12, '0')}`,
        amount_text: input.amount,
        user_id: ownerId,
        created_at: timestamp,
      };
      state.contributions.push(contribution);
      await respond(contribution, 201);
      return;
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
    created_at: timestamp,
    updated_at: timestamp,
    email_confirmed_at: timestamp,
  };
}

test('tracks goal contributions without creating movements or changing accounts', async ({
  page,
}) => {
  const backend = await installSupabaseMock(page);

  await page.goto('/');
  await page.getByRole('button', { name: 'Crear cuenta' }).first().click();
  await page.getByLabel('Correo electrónico').fill('goals-owner@example.invalid');
  await page.getByLabel('Contraseña').fill('goals-password-2026');
  await page
    .getByRole('form', { name: 'Crear cuenta' })
    .getByRole('button', { name: 'Crear cuenta' })
    .click();
  await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('link', { name: 'Gestión', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Gestión financiera' })).toBeVisible();
  const goalsPanel = page.locator('#savings-goals');
  await goalsPanel.scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Metas de ahorro' })).toBeVisible();
  await expect(goalsPanel).not.toHaveAttribute('open', '');
  await goalsPanel.locator('summary').click();
  await expect(goalsPanel).toHaveAttribute('open', '');
  await expect(page.locator('html')).toHaveCSS('scrollbar-width', 'none');
  await expect(page.locator('body')).toHaveCSS('overflow-x', 'clip');
  await page.getByRole('button', { name: 'Agregar meta', exact: true }).click();
  const createDialog = page.getByRole('dialog', { name: 'Crear meta de ahorro' });
  await expect(createDialog).toBeVisible();
  await expect(createDialog).toHaveCSS('overflow-y', 'auto');
  expect((await createDialog.boundingBox())?.width).toBe(320);
  const createForm = page.getByRole('form', { name: 'Crear meta de ahorro' });
  await createForm.getByLabel('Nombre de la meta').fill('Viaje al sur');
  await createForm.getByLabel('Importe objetivo').fill('0');
  await createForm.getByLabel('Moneda de la meta').selectOption('ARS');
  await createForm.getByLabel('Fecha objetivo (opcional)').fill('');
  await createForm.getByRole('button', { name: 'Crear meta' }).click();
  await expect(createForm.getByRole('alert')).toContainText('positivo');
  expect(backend.goals).toHaveLength(0);

  await createForm.getByLabel('Importe objetivo').fill('50000.00');
  await createForm.getByLabel('Fecha objetivo (opcional)').fill('2026-12-31');
  await createForm.getByRole('button', { name: 'Crear meta' }).click();

  const goals = page.getByRole('list', { name: 'Metas de ahorro' });
  const goal = goals.getByRole('listitem').filter({ hasText: 'Viaje al sur' });
  await expect(goal).toContainText('ARS 50.000,00');
  await expect(goal).toContainText('ARS 0,00');
  await expect(goal).toContainText('Fecha objetivo');
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(
    320,
  );

  await goal.getByRole('button', { name: 'Registrar aporte' }).click();
  const contributionForm = goal.getByRole('form', { name: 'Registrar aporte' });
  await contributionForm.getByLabel('Importe del aporte').fill('0');
  await contributionForm.getByLabel('Fecha del aporte').fill('2026-09-26');
  await contributionForm.getByRole('button', { name: 'Agregar aporte' }).click();
  await expect(contributionForm.getByRole('alert')).toContainText('positivo');
  expect(backend.contributions).toHaveLength(0);

  await contributionForm.getByLabel('Importe del aporte').fill('1250.50');
  await contributionForm.getByLabel('Fecha del aporte').fill('2026-09-26');
  await contributionForm.getByRole('button', { name: 'Agregar aporte' }).click();
  await expect(goal).toContainText('ARS 1.250,50');

  await goal.getByRole('button', { name: 'Registrar aporte' }).click();
  await contributionForm.getByLabel('Importe del aporte').fill('0.10');
  await contributionForm.getByLabel('Fecha del aporte').fill('2026-09-26');
  await contributionForm.getByRole('button', { name: 'Agregar aporte' }).click();

  await expect(goal).toContainText('ARS 1.250,60');
  expect(backend.goals).toHaveLength(1);
  expect(backend.goals[0]?.target_amount).toBe('50000');
  expect(backend.goals[0]?.target_date).toBe('2026-12-31');
  expect(backend.contributions).toHaveLength(2);
  expect(backend.contributions[0]?.amount_text).toBe('1250.5');
  expect(backend.contributions[1]?.amount_text).toBe('0.1');
  expect(backend.contributions[0]?.goal_id).toBe(backend.goals[0]?.id);
  expect(backend.contributions[1]?.goal_id).toBe(backend.goals[0]?.id);
  expect(backend.contributionPayloads[0]).not.toHaveProperty('currency');

  page.on('dialog', (dialog) => dialog.accept());
  await goal.getByRole('button', { name: 'Eliminar meta Viaje al sur' }).click();
  await expect(goal).toHaveCount(0);
  expect(backend.goals).toHaveLength(0);
  expect(backend.contributions).toHaveLength(0);
  expect(backend.movementWrites).toBe(0);
  expect(backend.accountWrites).toBe(0);
});
