import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const playwrightPort = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

if (!Number.isInteger(playwrightPort) || playwrightPort < 1 || playwrightPort > 65535) {
  throw new Error('PLAYWRIGHT_PORT must be a valid TCP port.');
}

const appUrl = `http://127.0.0.1:${playwrightPort}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: appUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${playwrightPort} --strictPort`,
    env: {
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'e2e-publishable-key',
    },
    url: appUrl,
    reuseExistingServer: !isCI,
    timeout: 30_000,
  },
});
