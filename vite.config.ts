import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  // Use relative asset URLs ('./') for production builds so the same dist/ works
  // regardless of the path it's served under:
  //   - GitHub Pages publishes this repo at https://mucow24.github.io/billboard-builder/
  //     (served from the /billboard-builder/ subpath), and
  //   - a local static server serves dist/ from the root.
  // A relative base resolves correctly in both; an absolute '/billboard-builder/'
  // base 404s the assets when served from root. The app has no client-side router,
  // so no nested route can shift the document base and break the relative paths.
  // The dev server keeps an absolute '/' base (mode is 'development' there, and
  // 'production' for both `vite build` and `vite preview`), so the Playwright e2e
  // suite, which drives the preview server at '/', is unaffected.
  base: mode === 'production' ? './' : '/',
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
}));
