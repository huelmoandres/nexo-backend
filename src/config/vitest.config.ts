import path from 'node:path';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const projectRoot = path.resolve(__dirname, '../..');

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
  root: projectRoot,
  resolve: {
    // vite-tsconfig-paths puede resolver el paquete npm "vitest" al config local.
    alias: {
      vitest: path.join(projectRoot, 'node_modules/vitest/dist/index.js'),
    },
  },
  plugins: [
    tsconfigPaths({ root: projectRoot }),
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
        'src/modules/portfolio/portfolio.service.ts',
        'src/app.module.ts',
        'src/main.ts',
        'src/config/vitest.config.ts',
        'src/config/vitest.e2e.config.ts',
        'src/config/*.config.ts',
        'src/config/*.setup.ts',
        // Re-exports / tipos sin lógica ejecutable (cobertura en módulo canónico)
        'src/modules/users/services/authorization.service.ts',
        'src/modules/users/guards/roles.guard.ts',
        'src/modules/users/decorators/roles.decorator.ts',
        'src/modules/portfolio/services/content-moderation.provider.ts',
        'src/common/errors/error-codes.ts',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
