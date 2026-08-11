import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      '**/tests/e2e/**',
      'tests/e2e/**',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts', 'tests/setup/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./tests/setup/dom.setup.ts'],
          include: ['tests/dom/**/*.test.ts', 'tests/dom/**/*.test.tsx', 'tests/api/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
