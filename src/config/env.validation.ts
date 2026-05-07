type EnvRecord = Record<string, string | undefined>;

function requireNonEmpty(env: EnvRecord, key: string, errors: string[]): void {
  if (!env[key] || env[key]?.trim() === '') {
    errors.push(`${key} is required`);
  }
}

export function validateEnv(env: EnvRecord): EnvRecord {
  const errors: string[] = [];
  requireNonEmpty(env, 'DATABASE_URL', errors);
  requireNonEmpty(env, 'SUPABASE_JWT_SECRET', errors);

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join(', ')}`);
  }

  return env;
}
