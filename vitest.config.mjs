import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'tests/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    globals: true,
  },
});
