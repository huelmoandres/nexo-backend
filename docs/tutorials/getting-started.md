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

Edita `.env` con los siguientes valores. Todos son obligatorios — la aplicación no arranca si falta alguno:

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

# ─── AWS / Cloudflare R2 (archivos KYC y evidencias) ───────────────────────────
S3_BUCKET_NAME="nexos-evidencias"
S3_ACCESS_KEY_ID="tu-access-key"
S3_SECRET_ACCESS_KEY="tu-secret-key"
S3_ENDPOINT="https://tu-cuenta.r2.cloudflarestorage.com"

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
docker-compose up -d
```

Verifica que los contenedores estén corriendo:

```bash
docker ps
# Deberías ver: nexos-postgres, nexos-redis, nexos-mongo
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

Para probar endpoints protegidos necesitas un JWT de Supabase. Obtén uno iniciando sesión desde la App o usando el panel de Supabase → Authentication → Users.

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

- Lee `docs/explanation/architecture.md` para entender las decisiones de diseño.
- Lee `docs/explanation/escrow-logic.md` antes de tocar cualquier módulo financiero.
- Consulta `.harness/specs/` para el módulo en el que vayas a trabajar.
