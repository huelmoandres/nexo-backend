# Eval: Users Module — Checklist de Auto-Verificación
**Cuándo usar:** Ejecutar este checklist completo antes de declarar el UsersModule como "terminado" o hacer PR.
**Referencia:** `.harness/specs/users-module.md`

---

## Checklist de Seguridad

### Control de Acceso (RBAC)
- [ ] El `RolesGuard` está implementado como un guard que lee el decorador `@Roles()`.
- [ ] El decorador `@Roles()` está aplicado correctamente en `POST /users/company/employees` exigiendo `Role.COMPANY_ADMIN`.
- [ ] Un `CLIENT` o `COMPANY_EMPLOYEE` que intente acceder a `POST /users/company/employees` recibe `403 Forbidden`.

### Escalada de Privilegios (Endpoint de Empleados)
- [ ] El DTO `CreateEmployeeDto` **no contiene** el campo `role`. Si el campo existe en el DTO, es un fallo de seguridad crítico.
- [ ] El rol del empleado creado es siempre `COMPANY_EMPLOYEE`, forzado en el Service, nunca tomado del body.
- [ ] El nuevo empleado queda vinculado al `companyId` del `COMPANY_ADMIN` que hace la petición.

### KYC y Documentos Sensibles
- [ ] Las URLs de los documentos KYC (`documentFrontUrl`, `selfieUrl`) son almacenadas en la base de datos pero nunca devueltas en la respuesta de `GET /users/me` sin ser URL firmadas.
- [ ] El endpoint `POST /users/verification/kyc` devuelve `202 Accepted`, no `200` ni `201`, porque el procesamiento es asíncrono.
- [ ] Si el usuario ya tiene `kycStatus: VERIFIED`, el endpoint devuelve `400 Bad Request` con el slug `kyc-already-verified`.
- [ ] El Job enviado a BullMQ contiene las URLs de los documentos y el `userId`. No contiene datos sensibles adicionales que no sean necesarios para el Worker.

### Perfil de Usuario
- [ ] El endpoint `GET /users/me` extrae el `supabaseUid` del token JWT, nunca de un parámetro de query o path.
- [ ] Si el usuario existe pero no tiene `ProfessionalProfile`, la respuesta devuelve el usuario con `professionalProfile: null`, no un `404`.
- [ ] Si el usuario no existe en absoluto, devuelve `404 Not Found` con el slug `user-not-found`.

---

## Checklist de Calidad de Código

- [ ] Todos los DTOs usan `class-validator` y `class-transformer`.
- [ ] Las tareas de larga duración (llamada a API externa de identidad como MetaMap) se delegan a BullMQ. El Controller responde en menos de 200ms.
- [ ] No existe ningún `console.log`. Todo logging usa `this.logger`.
- [ ] Los errores siguen el formato RFC 7807.

---

## Test Manual Rápido

```bash
# JWT de un usuario COMPANY_ADMIN
ADMIN_JWT="eyJ..."
# JWT de un usuario CLIENT
CLIENT_JWT="eyJ..."

# 1. Obtener mi perfil (ambos roles deben funcionar)
curl http://localhost:3000/users/me \
  -H "Authorization: Bearer $ADMIN_JWT"

# 2. Crear empleado como ADMIN → debe devolver 201
curl -X POST http://localhost:3000/users/company/employees \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "empleado@empresa.com", "fullName": "Juan Perez"}'

# 3. Crear empleado como CLIENT → debe devolver 403
curl -X POST http://localhost:3000/users/company/employees \
  -H "Authorization: Bearer $CLIENT_JWT" \
  -H "Content-Type: application/json" \
  -d '{"email": "hack@intento.com", "fullName": "Hacker"}'

# 4. Subir KYC → debe devolver 202
curl -X POST http://localhost:3000/users/verification/kyc \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "documentFrontUrl": "https://r2.nexos.com/signed/cedula-front.jpg",
    "selfieUrl": "https://r2.nexos.com/signed/selfie.jpg"
  }'
```
