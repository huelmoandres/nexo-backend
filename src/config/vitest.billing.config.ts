import path from 'node:path';
import base from './vitest.config';

const projectRoot = path.resolve(__dirname, '../..');

export default {
  ...base,
  test: {
    ...base.test,
    include: [
      'src/modules/billing/**/__tests__/*.spec.ts',
      'src/common/mercadopago/**/__tests__/*.spec.ts',
    ],
    coverage: {
      ...base.test?.coverage,
      include: [
        'src/modules/billing/**/*.ts',
        'src/common/mercadopago/**/*.ts',
      ],
      exclude: [
        'src/**/__tests__/**',
        'src/modules/billing/**/*.module.ts',
        'src/modules/billing/**/dto/**',
      ],
      thresholds: {
        lines: 100,
        functions: 100,
        statements: 100,
        branches: 88,
      },
    },
  },
};
