import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    clearMocks: true,
    environment: 'jsdom',
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/tests/e2e/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
});
