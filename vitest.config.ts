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
    workspace: [
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
      include: ['lib/**/*.ts', 'features/**/*.ts', 'components/**/*.tsx'],
      exclude: [
        '**/*.d.ts',
        'lib/api/contracts.ts',
        'features/ingestion/types.ts',
        'components/Phase1TestHarness.tsx',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
        'lib/**/*.ts': { branches: 90 },
        'features/**/*.ts': { branches: 90 },
      },
    },
  },
});
