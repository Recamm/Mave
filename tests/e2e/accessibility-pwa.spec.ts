import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('provides an installable app shell and icon assets', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mave' })).toBeVisible();
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'Mave',
  );

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).not.toBeNull();

  const manifestResponse = await page.request.get(manifestHref ?? '/manifest.webmanifest');
  expect(manifestResponse.ok()).toBe(true);

  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    display: 'standalone',
    name: 'Mave',
    short_name: 'Mave',
  });
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );

  for (const icon of manifest.icons as { sizes: string; src: string }[]) {
    const response = await page.request.get(new URL(icon.src, manifestResponse.url()).toString());
    expect(response.ok()).toBe(true);
    const image = await response.body();
    if (icon.sizes === 'any') {
      expect(image.toString('utf8')).toContain('<svg');
      continue;
    }

    const expectedSize = Number.parseInt(icon.sizes, 10);
    expect(image.readUInt32BE(16)).toBe(expectedSize);
    expect(image.readUInt32BE(20)).toBe(expectedSize);
  }

  const appleIconLink = page.locator('link[rel="apple-touch-icon"]');
  await expect(appleIconLink).toHaveAttribute('sizes', '180x180');
  await expect(appleIconLink).toHaveAttribute('type', 'image/png');
  const appleIconHref = await appleIconLink.getAttribute('href');
  expect(appleIconHref).not.toBeNull();
  const appleIcon = await page.request.get(appleIconHref ?? './icons/apple-touch-icon.png');
  expect(appleIcon.ok()).toBe(true);
  const appleImage = await appleIcon.body();
  expect(appleImage.readUInt32BE(16)).toBe(180);
  expect(appleImage.readUInt32BE(20)).toBe(180);

  const registration = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) {
      return null;
    }

    const activeRegistration = await navigator.serviceWorker.ready;
    const cacheNames = await caches.keys();
    const cachedRequests = await Promise.all(
      cacheNames.map(async (cacheName) => (await caches.open(cacheName)).keys()),
    );

    return {
      cachedUrls: cachedRequests.flat().map((request) => request.url),
      scriptUrl: activeRegistration.active?.scriptURL ?? null,
    };
  });

  expect(registration?.scriptUrl).toContain('/service-worker.js');
  expect(registration?.cachedUrls).toContain(new URL('./', manifestResponse.url()).toString());
  expect(registration?.cachedUrls.some((url) => /\/(rest|auth|functions)\/v1\//.test(url))).toBe(
    false,
  );
});

test('keeps the sign-in flow keyboard accessible at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.goto('/');
  await expect(page.locator('.auth-panel')).toHaveCSS('opacity', '1');
  await expect(page.getByRole('form', { name: 'Iniciar sesión' })).toBeVisible();

  await page.keyboard.press('Tab');
  const firstMode = page.getByLabel('Acceso a Mave').getByRole('button', {
    name: 'Iniciar sesión',
  });
  await expect(firstMode).toBeFocused();
  await expect(firstMode).toHaveCSS('outline-width', '3px');

  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(documentWidth).toBeLessThanOrEqual(320);

  await expect(page.getByRole('radio', { name: 'Oscura' })).toHaveCount(0);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(results.violations).toEqual([]);
});
