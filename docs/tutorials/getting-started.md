# Tutorial: Levantar el Entorno de Nexos
**Tipo:** Tutorial (aprendizaje paso a paso)
**Audiencia:** Desarrollador que se incorpora al proyecto por primera vez.
**Resultado:** Al finalizar este tutorial tendrás el backend de Nexos corriendo localmente y podrás hacer tu primera petición autenticada.

---

## Prerrequisitos

Antes de empezar, asegúrate de tener instalado:
- **Node.js** v20 o superior (`node --version`)
- **npm** v10 o superior (`npm --version`)
- **Docker Desktop** (para correr PostgreSQL y Redis localmente)
- Una cuenta en [Supabase](https://supabase.com) (gratuita)

---

## Paso 1: Clonar y instalar dependencias

```bash
git clone <url-del-repo>
cd nexos-backend
npm install
```

---

## Paso 2: Configurar las variables de entorno

Crea el archivo `.env` en la raíz del proyecto copiando el template:

```bash
cp .env.example .env
```

Edita `.env` con los siguientes valores base. Para una guía completa y defaults reales de runtime, tomá como fuente de verdad `.env.example`:

```env
# ─── Base de Datos Principal ───────────────────────────────────────────────────
DATABASE_URL="postgresql://postgres:password@localhost:5432/nexos_dev"

# ─── Supabase Auth ─────────────────────────────────────────────────────────────
# Encuéntralos en: tu-proyecto.supabase.co → Settings → API
SUPABASE_URL="https://tu-proyecto.supabase.co"
SUPABASE_JWT_SECRET="tu-jwt-secret-de-supabase"

# ─── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL="redis://localhost:6379"

# ─── MongoDB (solo para chats) ──────────────────────────────────────────────────
MONGODB_URI="mongodb://localhost:27017/nexos_chats"

# ─── Cloudflare R2 (archivos: portfolio/KYC) ───────────────────────────────────
R2_ACCOUNT_ID="<tu-account-id>"
R2_ACCESS_KEY_ID="<tu-access-key>"
R2_SECRET_ACCESS_KEY="<tu-secret-key>"
R2_ENDPOINT="https://<tu-account-id>.r2.cloudflarestorage.com"
R2_BUCKET_PUBLIC="nexos-public"
R2_BUCKET_KYC="nexos-kyc"

# ─── IA (moderación) ────────────────────────────────────────────────────────────
AI_OPENAI_API_KEY="<tu-openai-key>"
AI_AWS_REGION="us-east-1"
AI_AWS_ACCESS_KEY_ID="<tu-aws-access-key-id>"
AI_AWS_SECRET_ACCESS_KEY="<tu-aws-secret-access-key>"

# ─── Sentry ────────────────────────────────────────────────────────────────────
SENTRY_DSN="https://tu-dsn@sentry.io/proyecto"

# ─── Configuración de Negocio ──────────────────────────────────────────────────
ESCROW_SILENT_ACCEPTANCE_HOURS=48
URGENCY_BROADCAST_RADIUS_KM=7
URGENCY_EXPIRATION_MINUTES=30
```

---

## Paso 3: Levantar la infraestructura con Docker

El archivo `docker-compose.yml` levanta PostgreSQL (con PostGIS), Redis y MongoDB:

```bash
docker compose up -d
```

**Opcional — monitor de colas BullMQ (Bull Board):**

```bash
docker compose --profile tools up -d
# http://localhost:3030 (auth: BULL_BOARD_USER / BULL_BOARD_PASSWORD en .env)
```

Verifica que los contenedores estén corriendo:

```bash
docker compose ps
# Deberías ver: nexos_postgres, nexos_redis, nexos_mongodb
```

---

## Paso 4: Inicializar la base de datos con Prisma

```bash
# Generar el cliente de Prisma a partir del schema
npx prisma generate

# Aplicar las migraciones a la base de datos local
npx prisma migrate dev --name init

# (Opcional) Ver la base de datos en el navegador
npx prisma studio
```

### Datos de prueba (seeds)

Para cargar datos demo o geográficos según el entorno, usa los scripts npm documentados en [.harness/specs/seeds.md](../../.harness/specs/seeds.md):

```bash
npm run db:seed
# Variantes: db:seed:geo, db:seed:categories, db:seed:demo (ver package.json)
```

Las variables `SEED_*` y el alcance de cada script están descritos en la spec de seeds — **no confundir** con las factories de Vitest en `test/factories/`.

---

## Paso 5: Arrancar el servidor en modo desarrollo

```bash
npm run start:dev
```

Deberías ver en la consola:

```
[Nest] LOG [NestApplication] Nexos API is running on http://localhost:3000
```

---

## Paso 6: Hacer tu primera petición

Con el servidor corriendo, prueba los endpoints de salud:

```bash
curl http://localhost:3000/health/live
# Respuesta esperada: { "status": "ok" }

curl http://localhost:3000/health/ready
# Respuesta esperada: { "status": "ok", "checks": { ... } }
```

Para probar endpoints protegidos necesitas un **JWT de Supabase** (`session.access_token` desde el cliente Supabase). Flujo típico:

1. Inicia sesión en el cliente (app o Supabase Auth helpers) y copia el access token.
2. Primera vez en el backend: llama **`POST /api/auth/sync`** con header `Authorization: Bearer <token>` y cuerpo con email y nombre — crea el usuario en PostgreSQL alineado al `sub` del JWT (no confíes en IDs enviados fuera del token).

Guía detallada de Postman y variables de entorno: [docs/reference/api-testing.md](../reference/api-testing.md).

---

## Entendiendo el Scaffolding de `/src/modules/`

Todo el código de negocio vive en módulos aislados por dominio. La estructura de cada módulo sigue este patrón:

```
src/modules/users/
├── users.module.ts       # Orquestación: importa/exporta providers
├── users.controller.ts   # HTTP: recibe Request, llama Service, formatea respuesta
├── users.service.ts      # Lógica de negocio: aquí vive el "cerebro"
├── dto/
│   ├── create-user.dto.ts    # Validación de entrada con class-validator
│   └── update-user.dto.ts
├── entities/
│   └── user.entity.ts        # Interfaz del modelo de dominio
└── interfaces/
    └── user.repository.interface.ts  # Contrato para evitar acoplamiento
```

**Flujo de una petición:**
```
HTTP Request → Controller (valida DTO) → Service (ejecuta lógica) → Prisma (persiste) → Response
```

El Controller **nunca** llama a Prisma directamente. El Service **nunca** formatea respuestas HTTP.

---

## Próximos pasos

- Lee [AGENTS.md](../../AGENTS.md) si usas asistentes de código o te incorporás al repo.
- Lee `docs/explanation/architecture.md` para entender las decisiones de diseño.
- Lee `docs/explanation/escrow-logic.md` antes de tocar cualquier módulo financiero.
- Consulta `.harness/specs/` para el módulo en el que vayas a trabajar.
