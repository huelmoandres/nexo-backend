import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

/**
 * Configuración de Vitest para tests UNITARIOS.
 *
 * Características:
 * - unplugin-swc: procesa decoradores TypeScript de NestJS sin transpilación lenta.
 * - vite-tsconfig-paths: resuelve los path aliases (@modules/*, @common/*, etc.).
 * - Sin Testcontainers: las dependencias externas (DB, Redis) se mockean.
 *
 * Ejecución: `npm run test`
 */
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2021',
        parser: {
          syntax: 'typescript',
          decorators: true,
        },
        transform: {
          legacyDecorator: true,
          decoratorMetadata: true,
        },
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/*.spec.ts'],
    setupFiles: ['test/setup/unit-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/__tests__/**',
        'src/**/*.module.ts',
        'src/**/*.types.ts',
        'src/**/dto/**',
        'src/**/entities/**',
        'src/**/interfaces/**',
        'src/main.ts',
        'src/config/vitest.config.ts',
        'src/config/vitest.e2e.config.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
