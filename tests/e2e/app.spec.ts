import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('renders the app shell', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Mave' })).toBeVisible();
});

test('app shell has no automated accessibility violations', async ({ page }) => {
  await page.goto('/');

  const results = await new AxeBuilder({ page }).analyze();

  expect(results.violations).toEqual([]);
});
