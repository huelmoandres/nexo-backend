# API Testing — Swagger UI y Postman

**Tipo:** Reference (Diátaxis)
**Audiencia:** Desarrolladores del equipo Nexos / HRProgrammers

---

## 1. Swagger UI (Documentación Interactiva)

El servidor expone una UI interactiva de Swagger en desarrollo.

| URL | Descripción |
|---|---|
| `http://localhost:3000/api/docs` | UI interactivo de Swagger |
| `http://localhost:3000/api/docs-json` | JSON OpenAPI 3.0 (para Postman) |

> **Nota:** Swagger solo está disponible cuando `NODE_ENV !== 'production'`. En producción no se expone ninguna ruta de documentación.

### Autenticarse en Swagger UI

1. Levanta el servidor local: `npm run start:dev`
2. Obtén un JWT de Supabase (ver sección 4 de este documento).
3. En `http://localhost:3000/api/docs`, haz clic en el botón **Authorize** (candado superior derecho).
4. Pega el JWT en el campo **Value** del esquema `supabase-jwt (http, Bearer)`.
5. Haz clic en **Authorize** → **Close**.
6. Todos los endpoints con el candado cerrado enviarán el header `Authorization: Bearer <token>` automáticamente.

---

## 2. Importar la Colección en Postman

### Paso a paso

1. Con el servidor corriendo, descarga el JSON de OpenAPI:
   ```
   GET http://localhost:3000/api/docs-json
   ```
   O guárdalo directamente desde el browser.

2. En Postman, haz clic en **Import** → **Raw text** (o arrastra el archivo `.json`).

3. Postman generará una colección completa con todos los endpoints agrupados por tag.

4. Renombra la colección como **Nexos API — Local**.

### Actualizar la colección cuando la API cambia

Cada vez que se agreguen nuevos endpoints o DTOs, repite la importación.
Para no perder los tests de Postman existentes, usa **Merge** en lugar de reemplazar.

---

## 3. Configurar el Environment en Postman

Crea un **Environment** llamado `Nexos — Local` con las siguientes variables:

| Variable | Valor inicial | Descripción |
|---|---|---|
| `baseUrl` | `http://localhost:3000` | URL base del servidor local |
| `authToken` | _(vacío — se llena manualmente o con el test de login)_ | JWT del usuario CLIENT de prueba |
| `adminToken` | _(vacío)_ | JWT del usuario SUPER_ADMIN de prueba |
| `testUserId` | _(vacío)_ | ID del usuario creado en la sesión de prueba |
| `testJobId` | _(vacío)_ | ID del Job creado en la sesión de prueba |
| `testEscrowId` | _(vacío)_ | ID del EscrowTransaction creado en la sesión de prueba |
| `testDisputeId` | _(vacío)_ | ID del Dispute creado en la sesión de prueba |

> **Tip:** Usa el script **Tests** de Postman en el request de login/auth para capturar el token automáticamente:
> ```javascript
> const json = pm.response.json();
> pm.environment.set('authToken', json.accessToken);
> pm.environment.set('testUserId', json.user.id);
> ```

### Usar las variables en los requests

- En la URL: `{{baseUrl}}/jobs/{{testJobId}}`
- En los headers: `Authorization: Bearer {{authToken}}`

---

## 4. Obtener un JWT de Supabase para Testing

### Opción A — Desde el dashboard de Supabase

1. Ve a `https://supabase.com/dashboard/project/<project-ref>/auth/users`.
2. Crea un usuario de prueba (o usa uno existente).
3. Usa la opción **Send magic link** o impersona al usuario para obtener el token.

### Opción B — Desde la CLI de Supabase (recomendado para desarrollo)

```bash
curl -X POST 'https://<project-ref>.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@hrprogrammers.com", "password": "dev-password-local"}'
```

La respuesta contiene el campo `access_token`. Cópialo en la variable `authToken` de tu Postman Environment.

### Opción C — Request de Login en Postman

Crea un request manual en la colección:

```
POST {{baseUrl}}/auth/login
Content-Type: application/json

{
  "email": "dev@hrprogrammers.com",
  "password": "dev-password-local"
}
```

Con el test de Postman:

```javascript
pm.test('Login exitoso', function () {
  pm.response.to.have.status(200);
  const json = pm.response.json();
  pm.environment.set('authToken', json.accessToken);
});
```

---

## 5. Tests Automáticos en Postman

Cada request guardado en la colección oficial debe incluir tests básicos en la pestaña **Tests**.

### Template mínimo (respuesta exitosa)

```javascript
pm.test('Status 200', function () {
  pm.response.to.have.status(200);
});

pm.test('Estructura de respuesta correcta', function () {
  const json = pm.response.json();
  pm.expect(json).to.have.property('id');
  pm.expect(json.id).to.be.a('string');
});
```

### Template para errores RFC 7807

```javascript
pm.test('Error con formato RFC 7807', function () {
  const json = pm.response.json();
  pm.expect(json).to.have.property('type');
  pm.expect(json).to.have.property('title');
  pm.expect(json).to.have.property('status');
  pm.expect(json).to.have.property('code');
  pm.expect(json.code).to.be.a('string');
});
```

### Template para listas paginadas

```javascript
pm.test('Respuesta paginada correcta', function () {
  const json = pm.response.json();
  pm.expect(json).to.have.property('data');
  pm.expect(json).to.have.property('total');
  pm.expect(json).to.have.property('page');
  pm.expect(json).to.have.property('limit');
  pm.expect(json.data).to.be.an('array');
});
```

---

## 6. Estructura de la Colección Oficial

La colección de Postman debe organizarse en carpetas que coincidan con los tags de Swagger:

```
Nexos API — Local/
├── auth/
│   ├── POST Sync User (primer login)
│   └── POST Logout
├── users/
│   ├── GET My Profile
│   ├── PATCH Update Profile
│   └── POST Upload KYC Document (presign)
├── jobs/
│   ├── POST Create Job
│   ├── GET Job by ID
│   └── PATCH Update Job Status
├── escrow/
│   ├── POST Fund Escrow
│   ├── POST Release Escrow
│   └── POST Refund Escrow
├── urgencies/
│   └── POST Dispatch Urgency
├── disputes/
│   ├── POST Open Dispute
│   ├── POST Upload Evidence (presign)
│   └── PATCH Activate Second Chance
└── search/
    └── GET Search Professionals
```

> **Convención:** Los nombres de los requests usan el formato `VERBO Recurso` en inglés, igual que los tags de Swagger.

---

## 7. Checklist antes de hacer PR

- [ ] El endpoint y sus DTOs son visibles en `http://localhost:3000/api/docs`.
- [ ] Todos los DTOs de entrada tienen `@ApiProperty()` con `example` real.
- [ ] Las respuestas de error están documentadas con el schema `ProblemDetail`.
- [ ] El request está guardado en la carpeta correcta de la colección Postman.
- [ ] El request tiene al menos un test de Postman (`pm.test`).
- [ ] Los tests de Vitest pasan: `npm run test`.

Ver [coding-guidelines.md](coding-guidelines.md) — Sección 11 para los decoradores obligatorios de Swagger.
