/**
 * Pre-commit: ESLint sobre TypeScript en stage y Vitest `related` (config unitaria,
 * sin cobertura) para validar lógica afectada.
 * Los *.e2e-spec.ts usan Testcontainers; se validan con `npm run quality:check` / CI.
 */
function quotePath(file) {
  return JSON.stringify(file);
}

function isLintableTs(file) {
  return (
    file.endsWith('.ts') &&
    (file.startsWith('src/') ||
      file.startsWith('test/') ||
      file.startsWith('prisma/'))
  );
}

/** @type {import('lint-staged').Configuration} */
export default {
  '**/*.{ts,tsx}': (filenames) => {
    const tsFiles = filenames.filter(isLintableTs);
    if (tsFiles.length === 0) {
      return [];
    }

    const quoted = tsFiles.map(quotePath);
    const eslintCmd = `eslint --max-warnings=0 ${quoted.join(' ')}`;

    const forUnitRelated = tsFiles.filter((f) => !f.includes('.e2e-spec.ts'));
    if (forUnitRelated.length === 0) {
      return [eslintCmd];
    }

    const relatedQuoted = forUnitRelated.map(quotePath).join(' ');
    return [
      eslintCmd,
      `vitest related ${relatedQuoted} --run -c src/config/vitest.config.ts --passWithNoTests`,
    ];
  },
};
