# Eval: Auth Module — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist completo antes de declarar el AuthModule como "terminado" o hacer PR.
**Referencias:** `.harness/specs/auth-module.md` · `docs/reference/api-standards.md` (slugs canónicos)

---

## Checklist de Seguridad

### Extracción de Identidad
- [ ] El `supabaseUid` se extrae **exclusivamente** del payload del JWT validado (`req.user`), nunca del body de la petición.
- [ ] El body de `POST /auth/sync` no contiene el campo `supabaseUid`. Si aparece en el DTO, es un fallo de seguridad crítico.
- [ ] El email y fullName del `SyncUserDto` son los únicos campos que acepta el endpoint `/auth/sync`.

### SupabaseGuard
- [ ] El guard verifica primero la presencia del token en Redis (blocklist) **antes** de validar la firma criptográfica.
- [ ] El guard está aplicado con `@UseGuards(SupabaseGuard)` en **todos** los endpoints del AuthModule.
- [ ] Si falta el header `Authorization: Bearer` o el token está vacío, el guard devuelve `401` con `code: AUTH_TOKEN_MISSING` (ver `api-standards.md`).
- [ ] Cuando el token está en la blocklist de Redis, el guard devuelve `401` con `code: AUTH_TOKEN_REVOKED`.
- [ ] Cuando el token está expirado o la firma es inválida, el guard devuelve `401` con `code: AUTH_INVALID_TOKEN`.

### Logout y Redis Blocklist
- [ ] El token se guarda en Redis con la clave exacta `blocklist:<token_raw>`.
- [ ] El TTL del registro en Redis se calcula como `exp_del_token - timestamp_actual_en_segundos`. Nunca un TTL fijo.
- [ ] El endpoint `POST /auth/logout` devuelve `200 OK` (no `204`) con un mensaje de confirmación.
- [ ] Si Redis no está disponible, el logout devuelve `500` y lo reporta a Sentry.

### Sincronización de Usuario
- [ ] Si el usuario ya existe en PostgreSQL (`User.findUnique` devuelve un resultado), el endpoint devuelve `200 OK` sin crear nada.
- [ ] Si el usuario no existe, se crea con el rol por defecto `CLIENT`. El rol nunca viene del body.
- [ ] El nuevo `User` cumple el schema Prisma (`supabaseUid`, `email`, `fullName`, `role: CLIENT` por defecto).

---

## Checklist de Calidad de Código

- [ ] No existe ningún import de `bcrypt`, `argon2` ni ninguna librería de hashing de contraseñas. Las contraseñas son 100% responsabilidad de Supabase.
- [ ] No existe ningún `console.log`. Todo logging usa `this.logger` del Logger nativo de NestJS.
- [ ] Los errores siguen el formato RFC 7807 usando el filtro global de excepciones.
- [ ] Existe TSDoc (`/** ... */`) en los métodos públicos del `AuthService`.

---

## Test Manual Rápido

```bash
# 1. Obtén un JWT válido de Supabase
JWT="eyJ..."

# 2. Sincronizar usuario (primera vez → debe devolver 201)
curl -X POST http://localhost:3000/auth/sync \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@nexos.com", "fullName": "Test User"}'

# 3. Sincronizar usuario (segunda vez → debe devolver 200)
curl -X POST http://localhost:3000/auth/sync \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@nexos.com", "fullName": "Test User"}'

# 4. Logout → debe devolver 200
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer $JWT"

# 5. Usar el mismo token después del logout → debe devolver 401
curl -X POST http://localhost:3000/auth/sync \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@nexos.com", "fullName": "Test User"}'
```
