# Nexos Backend

**Marketplace de servicios profesionales para Uruguay**
Desarrollado por [HRProgrammers](https://hrprogrammers.com)

---

## Descripción

Nexos es un marketplace que conecta clientes con profesionales de servicios del hogar y empresas B2B. El backend gestiona el ciclo de vida completo: desde la búsqueda geoespacial de profesionales hasta la resolución de disputas con Escrow financiero garantizado (ACID).

**Stack principal (estado actual):** NestJS · PostgreSQL + PostGIS · Prisma · Supabase Auth · Redis

**Procesamiento asíncrono:** BullMQ (moderación IA, cleanup, notificaciones, consent reminders).

**Módulos activos en código:** `auth`, `users`, `storage`, `health`, `diagnostics`, `categories`, `search`, `portfolio`, `notifications`, `ai`, `authorization`.

---

## Desarrollo con IA

- **[AGENTS.md](AGENTS.md)** — entrada de este repo (explicación → referencia → harness → código).
- Workspace **backend + frontend** en una carpeta: **[../AGENTS.md](../AGENTS.md)**.

Complementa [`.cursorrules`](.cursorrules) y el [Harness Index](.harness/INDEX.md).

---

## Quick Start

### Pre-requisitos

- Node.js 20+
- Docker + Docker Compose
- Cuenta de Supabase (Auth + Storage)

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/hrprogrammers/nexos-backend.git
cd nexos-backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales (Supabase, Redis, PostgreSQL, MongoDB, R2/S3)
```

Ver `.env.example` para la documentación de cada variable.

### 3. Levantar servicios locales con Docker

```bash
docker compose up -d
# Esto levanta: PostgreSQL+PostGIS, Redis y MongoDB
```

**Colas BullMQ (opcional, tipo Horizon):** UI [Bull Board](https://github.com/felixmosh/bull-board) en Docker:

```bash
docker compose --profile tools up -d
# http://localhost:3030 — usuario/clave: BULL_BOARD_USER / BULL_BOARD_PASSWORD (.env, default nexos / nexos_dev)
```

Verificá `dgi-verify`, `portfolio-moderate`, `silent-acceptance`, etc. en waiting / active / completed / failed.

Verificar que los servicios están saludables:

```bash
docker compose ps
```

### 4. Inicializar la base de datos

```bash
# Generar el cliente de Prisma
npx prisma generate

# Aplicar el schema a la base de datos local
npx prisma db push

# (Opcional) Abrir Prisma Studio
npx prisma studio
```

### 5. Iniciar el servidor

```bash
npm run start:dev
```

El servidor estará disponible en `http://localhost:3000`.

---

## Documentación de la API

| URL | Descripción |
|---|---|
| `http://localhost:3000/api/docs` | Swagger UI interactivo |
| `http://localhost:3000/api/docs-json` | JSON OpenAPI 3.0 (para importar en Postman) |

Solo disponible en `NODE_ENV=development`.

Ver [docs/reference/api-testing.md](docs/reference/api-testing.md) para la guía de Postman.

---

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run start:dev` | Servidor en modo watch (desarrollo) |
| `npm run build` | Compilar para producción |
| `npm run start:prod` | Servidor en modo producción |
| `npm run lint` | Lint + auto-fix con ESLint |
| `npm run format` | Formatear con Prettier |
| `npm run test` | Tests unitarios con Vitest |
| `npm run test:watch` | Tests unitarios en modo watch |
| `npm run test:cov` | Tests unitarios con cobertura (umbral 100% en `vitest.config.ts`) |
| `npm run test:cov:billing` | Cobertura solo módulo billing |
| `npm run test:e2e` | Tests de integración con Testcontainers |
| `npm run test:all` | Todos los tests (unit + e2e) |
| `npm run db:seed` | Orquestador: geo, categorías, monedas, bancos, demo, backfill (ver `.harness/specs/seeds.md`) |
| `npm run db:seed:geo` / `db:seed:demo` / … | Capas individuales del seed |
| `npm run geo:build` / `categories:build` | Regenerar JSON de catálogo antes de seed |
| `npm run quality:check` | `tsc + lint:ci + format:check + architecture + test:cov + e2e` |
| `npm run prepare` | Activa Husky tras `npm install` (hooks de Git locales) |

---

## Estructura del proyecto

```
nexos-backend/
├── .harness/                    # Harness Engineering (specs, rules, evals)
│   ├── INDEX.md                 # Índice central de toda la documentación
│   ├── SESSION_STATE.md         # Estado de sesión para el agente de IA
│   ├── specs/                   # Especificaciones por módulo
│   ├── rules/                   # Reglas de arquitectura y negocio
│   └── evals/                   # Checklists de auto-verificación
├── docs/                        # Documentación Diátaxis
│   ├── tutorials/               # Guías paso a paso (getting-started)
│   ├── how-to/                  # Recetas para tareas específicas
│   ├── explanation/             # Arquitectura, negocio y decisiones de diseño
│   └── reference/               # Standards, guidelines, API testing
├── prisma/
│   ├── schema.prisma            # Fuente de la verdad del esquema de datos
│   └── prisma.config.ts         # Configuración Prisma 7.x con adapter-pg
├── src/
│   ├── config/                  # Configuración Nest + Vitest (vitest.config.ts, *.config.ts)
│   ├── common/                  # Guards, filters, interceptors, decorators compartidos
│   └── modules/                 # Módulos NestJS por dominio (auth, users, escrow, etc.)
├── test/
│   ├── factories/               # Factories de entidades Prisma (fishery + faker)
│   ├── mocks/                   # Mocks de servicios externos (S3, MercadoPago, Expo)
│   └── setup/                   # Setup global y por ambiente de Vitest
├── docker-compose.yml           # Orquestación local: PostgreSQL+PostGIS, Redis, MongoDB
├── .env.example                 # Template de variables de entorno
```

---

## Arquitectura

Ver [docs/explanation/architecture.md](docs/explanation/architecture.md) para el detalle completo.

**Resumen:**
- **PostgreSQL + PostGIS:** Core financiero (Escrow, Jobs, Usuarios) con garantías ACID y queries geoespaciales.
- **MongoDB:** Historial de chats en alta frecuencia, sin saturar las transacciones de PostgreSQL.
- **Redis + BullMQ:** Weighted Broadcast para urgencias, Aceptación Silenciosa de Escrow, KYC y Push Notifications.
- **Cloudflare R2 / AWS S3:** Almacenamiento de evidencias, fotos de trabajo y documentos KYC con URLs firmadas.

---

## Definition of Done (DoD)

Un módulo o endpoint se considera **terminado** cuando cumple todos los puntos:

### Código
- [ ] El módulo tiene su spec en `.harness/specs/<nombre>-module.md`.
- [ ] No hay valores mágicos — todo configurado en `src/config/<nombre>.config.ts`.
- [ ] Imports usan Path Aliases (`@modules/*`, `@common/*`, `@config/*`).
- [ ] Ningún Service supera 200 líneas (SRP). Si lo hace, se dividió en Sub-Services.
- [ ] Cero usos de `any` — usar `unknown` o tipos explícitos.

### Testing
- [ ] Tests unitarios con Vitest: cobertura mínima según umbrales del módulo.
  - Umbral global obligatorio: **>= 95%** en `lines`, `branches`, `functions` y `statements`.
- [ ] Tests de integración con Testcontainers para lógica crítica de DB.
- [ ] Tests con fecha fija usando `vi.useFakeTimers()` para lógica de plazos (Escrow 48hs).
- [ ] Factories de `test/factories/` usadas en todos los tests — prohibidos objetos planos manuales.

### Documentación de API
- [ ] Endpoint visible en `http://localhost:3000/api/docs`.
- [ ] Todos los DTOs de entrada tienen `@ApiProperty()` con `example` real.
- [ ] Responses documentadas: al menos `200/201`, `400`, `401`.
- [ ] Request guardado en la colección Postman con al menos un `pm.test()`.

### Calidad
- [ ] Todos los errores devuelven formato RFC 7807 con `code` en SCREAMING_SNAKE_CASE.
- [ ] Todas las fechas son `TIMESTAMPTZ` y se manipulan con `date-fns`.
- [ ] Entrada de `AuditLog` creada para toda mutación financiera o de roles.
- [ ] El módulo está registrado en `.harness/INDEX.md`.

---

## Documentación adicional

| Documento | Descripción |
|---|---|
| [Arquitectura](docs/explanation/architecture.md) | Decisiones de diseño y flujos asíncronos |
| [Lógica de Negocio](docs/explanation/business.md) | Visión del producto y modelo de monetización |
| [Escrow Logic](docs/explanation/escrow-logic.md) | State Machine financiera y ACID |
| [Testing Guidelines](docs/reference/testing-guidelines.md) | Vitest, Testcontainers, Factories |
| [Coding Guidelines](docs/reference/coding-guidelines.md) | Estándares de TypeScript, SOLID, Swagger |
| [API Testing](docs/reference/api-testing.md) | Swagger UI y Postman |
| [Harness Index](.harness/INDEX.md) | Índice central de specs, rules y evals |
| [AGENTS.md](AGENTS.md) | Guía de entrada para IA y colaboradores |

---

## Guía de Contribución

### Conventional Commits

Los mensajes de commit deben seguir [Conventional Commits](https://www.conventionalcommits.org/) (validado por **Commitlint** en el hook `commit-msg`):

- Formato: `tipo(alcance opcional): descripción breve`
- Tipos habituales: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- La descripción va en minúsculas (salvo nombres propios) y sin punto final.

Ejemplos válidos:

```text
feat(auth): add Redis-backed token blocklist on logout
fix(escrow): correct silent acceptance deadline calculation
docs(readme): document quality gate and hooks
```

Ejemplos inválidos:

```text
WIP: stuff
fixed bug
Feat: Add thing
```

Tras `npm install`, Husky instala los hooks. Si el mensaje no cumple el estándar, `git commit` fallará con el error de Commitlint.

### Quality Gate (95% de cobertura)

El repositorio exige un **quality gate estricto**:

- **En local (pre-commit):** ESLint sobre los `.ts` en stage, `tsc --noEmit` en todo el proyecto y `vitest related` sobre archivos modificados (tests unitarios impactados; los `*.e2e-spec.ts` se cubren en el gate completo).
- **En CI:** el workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) ejecuta `npm run quality:check` en cada push y pull request a `main`: TypeScript, ESLint, tests unitarios con **cobertura global mínima del 95%** (líneas, ramas, funciones y statements) y tests e2e con Testcontainers.
- **Artefactos:** si la suite genera informes, el directorio `coverage/` se sube como artefacto del job (útil aunque el gate falle en un paso posterior).

Antes de abrir un PR, conviene ejecutar manualmente:

```bash
npm run quality:check
```

### Harness y DoD

1. Lee el [Harness Index](.harness/INDEX.md) antes de empezar.
2. Verifica que exista la spec del módulo en `.harness/specs/`.
3. Ejecuta el eval correspondiente en `.harness/evals/` antes de hacer PR.
4. El PR no se aprueba si algún punto del DoD no está cumplido.

---

*Nexos — HRProgrammers © 2025. Uruguay.*
