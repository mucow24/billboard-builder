import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Project site lives at https://mucow24.github.io/billboard-builder/, so assets
  // must be served from that subpath. The deploy workflow sets GITHUB_PAGES; dev,
  // preview, and e2e leave it unset and keep the root base.
  base: process.env.GITHUB_PAGES ? '/billboard-builder/' : '/',
  plugins: [react()],
  test: {
    testTimeout: 15_000,
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/e2e/**', '.claude/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.test.{ts,tsx}'],
    },
  },
});
