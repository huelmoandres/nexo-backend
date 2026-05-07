import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// __dirname is available in CommonJS context (used by Prisma CLI via ts-node)
const projectRoot = path.resolve(__dirname, '..');

// Load .env manually so Prisma config works without a shell-level export
try {
  const envContent = readFileSync(path.join(projectRoot, '.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
} catch {
  // .env not present (CI, production) — rely on process.env being pre-set
}

export default defineConfig({
  schema: path.join(__dirname, 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
