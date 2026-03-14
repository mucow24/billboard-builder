import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/App.tsx',
        'src/editor/model/**/*.ts',
        'src/editor/state/**/*.ts',
        'src/editor/canvas/**/*.ts',
        'src/editor/components/**/*.tsx',
        'src/editor/io/**/*.ts',
      ],
      exclude: ['src/main.tsx'],
    },
  },
});
