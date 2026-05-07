import * as jwt from 'jsonwebtoken';
// jwks-rsa usa `module.exports = (opts) => JwksClient`; `import x from 'jwks-rsa'` compila a
// `require(...).default` y falla sin esModuleInterop. La forma estable en CommonJS es:
// eslint-disable-next-line @typescript-eslint/no-require-imports -- importación CommonJS válida TS
import jwksRsa = require('jwks-rsa');

const jwksClientsByUri = new Map<string, jwksRsa.JwksClient>();

/**
 * Construye la URL JWKS público del proyecto Supabase.
 *
 * @param supabaseUrl - ej. https://abcd.supabase.co
 */
export function supabaseJwksUriFromEnv(supabaseUrl: string): string | null {
  const trimmed = supabaseUrl.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const u = new URL(trimmed.endsWith('/') ? trimmed : `${trimmed}/`);
    return `${u.origin}/auth/v1/.well-known/jwks.json`;
  } catch {
    return null;
  }
}

/** Claim `iss` de Supabase: `https://<ref>.supabase.co/auth/v1` */
export function supabaseJwksUriFromIssuer(
  iss: string | undefined,
): string | null {
  if (!iss?.includes('.supabase.co')) {
    return null;
  }
  return `${iss.replace(/\/$/, '')}/.well-known/jwks.json`;
}

/**
 * Resolución JWKS para tokens emitidos por Supabase.
 *
 * Preferimos siempre el **claim `iss` del JWT** cuando es un issuer de Supabase: así la clave de firma
 * coincide con quien emitió el token aunque `SUPABASE_URL` en `.env` esté desactualizado u otro proyecto.
 *
 * Fallback: `SUPABASE_URL` solo si no hay `iss` utilizable en el payload.
 */
export function resolveSupabaseJwksUri(
  envSupabaseUrl: string,
  tokenPayload: jwt.JwtPayload | string | undefined,
): string | null {
  if (typeof tokenPayload === 'object' && tokenPayload !== null) {
    const iss =
      typeof tokenPayload.iss === 'string' ? tokenPayload.iss : undefined;
    const fromIss = supabaseJwksUriFromIssuer(iss);
    if (fromIss) {
      return fromIss;
    }
  }
  return supabaseJwksUriFromEnv(envSupabaseUrl);
}

/** Cliente JWKS cacheado por URI (órigen + path). */
export function getJwksClient(jwksUri: string) {
  let client = jwksClientsByUri.get(jwksUri);
  if (!client) {
    client = jwksRsa({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
      jwksUri,
    });
    jwksClientsByUri.set(jwksUri, client);
  }
  return client;
}
