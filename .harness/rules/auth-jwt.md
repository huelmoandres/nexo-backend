# Rules: JWT, Supabase y JWKS
**Scope:** `src/modules/auth/`, guards y estrategia Passport.  
**Relacionado:** [spec auth-module](../specs/auth-module.md), [AGENTS.md](../../AGENTS.md).

---

## 1. Dos caminos de verificación

| Algoritmo | Mecanismo | Variable / dato |
|-----------|-----------|-----------------|
| **HS256** | Secreto simétrico compartido | `SUPABASE_JWT_SECRET` (obligatorio en config; usado en tests/E2E con tokens firmados en local). |
| **ES256** | Clave asimétrica vía **JWKS** | URI derivada del claim **`iss`** del JWT (preferido) o de `SUPABASE_URL` como fallback. |

No asumas que un solo secreto cubre todos los tokens emitidos por Supabase en producción.

---

## 2. Resolución de la URI JWKS

- **Preferido:** `iss` del payload → debe ser un issuer de Supabase (`*.supabase.co`) → path `/.well-known/jwks.json` bajo ese issuer.
- **Fallback:** `SUPABASE_URL` normalizado → `{origin}/auth/v1/.well-known/jwks.json`.

Implementación: `resolveSupabaseJwksUri`, `supabaseJwksUriFromIssuer`, `supabaseJwksUriFromEnv` en `src/modules/auth/supabase-jwks.util.ts`.

---

## 3. Paquete `jwks-rsa` (CommonJS)

El paquete expone `module.exports = function (...)`. Con `import jwks from 'jwks-rsa'` puede resolverse a `.default` inexistente.

**Patrón estable en este repo:**

```typescript
// eslint-disable-next-line @typescript-eslint/no-require-imports -- CJS interop
import jwksRsa = require('jwks-rsa');
```

No usar `import default` salvo que `esModuleInterop` y el bundler lo garanticen de forma verificada en CI.

---

## 4. Passport / `handleRequest` en el guard

En fallos JWT, Passport puede exponer el mensaje útil en **`info`**, no solo en `err`. El guard debe propagar **`info?.message`** (o equivalente) para diagnósticos 401 claros y logs coherentes.

---

## 5. Checklist rápido

- [ ] Tokens de producción: comprobar que la estrategia acepta ES256 con JWKS cuando el header `alg` es ES256.
- [ ] `.env`: `SUPABASE_URL` alineado al proyecto; aun así, el claim `iss` del token tiene prioridad para la clave correcta.
- [ ] Tests locales HS256: `SUPABASE_JWT_SECRET` presente; no llamar a la red para JWKS en tests unitarios de URI (solo funciones puras).
