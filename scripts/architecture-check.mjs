import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const checks = [
  {
    file: 'AGENTS.md',
    mustInclude: [
      '.harness/INDEX.md',
      '.harness/specs/seeds.md',
      'JWKS',
    ],
  },
  {
    file: 'src/config/vitest.config.ts',
    mustInclude: ['lines: 95', 'functions: 95', 'branches: 95', 'statements: 95'],
  },
  {
    file: 'docs/reference/testing-guidelines.md',
    mustInclude: ['| `lines` | **95%** |', '| `functions` | **95%** |'],
  },
  {
    file: 'src/config/swagger.setup.ts',
    mustInclude: [
      "'auth'",
      "'users'",
      "'health'",
      "'categories'",
      "'search'",
      'estado actual',
    ],
    mustNotInclude: [
      ".addTag('jobs'",
      ".addTag('escrow'",
      ".addTag('urgencies'",
      ".addTag('disputes'",
      ".addTag('reviews'",
      ".addTag('payments'",
    ],
  },
];

const errors = [];

for (const check of checks) {
  const path = resolve(root, check.file);
  const content = readFileSync(path, 'utf8').toLowerCase();

  for (const token of check.mustInclude ?? []) {
    if (!content.includes(token.toLowerCase())) {
      errors.push(`${check.file} must include: ${token}`);
    }
  }

  for (const token of check.mustNotInclude ?? []) {
    if (content.includes(token.toLowerCase())) {
      errors.push(`${check.file} must not include: ${token}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Architecture coherence check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Architecture coherence check passed.');
