import path from 'node:path';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const projectRoot = path.resolve(__dirname, '../..');

/**
 * Configuración de Vitest para tests de INTEGRACIÓN (e2e).
 *
 * Características:
 * - Testcontainers: levanta contenedores Docker reales de PostgreSQL+PostGIS,
 *   Redis y MongoDB al inicio de la suite y los destruye al finalizar.
 * - Pool "forks": cada archivo de test corre en un proceso Node.js separado
 *   para garantizar aislamiento de containers entre suites.
 * - Timeouts extendidos: los containers pueden tardar hasta 30s en arrancar.
 *
 * Prerrequisito: Docker debe estar corriendo localmente.
 * Ejecución: `npm run test:e2e`
 *
 * Variables de entorno: cargadas desde `.env.test` en la raíz del proyecto.
 */
export default defineConfig({
  root: projectRoot,
  resolve: {
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
    // Un solo archivo a la vez: e2e-setup trunca la DB en beforeEach; si varios
    // archivos corren en paralelo comparten el mismo Postgres y se pisan.
    fileParallelism: false,
    include: ['src/**/__tests__/*.e2e-spec.ts'],
    globalSetup: ['test/setup/global-setup.ts'],
    setupFiles: ['test/setup/e2e-setup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
