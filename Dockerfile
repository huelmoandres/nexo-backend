# =============================================================================
# NEXOS — Dockerfile Multi-Stage
# HRProgrammers
#
# Stages:
#   deps    → Instala node_modules (con cache de Docker layer)
#   builder → Genera Prisma client y compila TypeScript
#   runner  → Imagen mínima de producción (solo artefactos necesarios)
#
# Build:
#   docker build -t nexos-backend .
#
# Run:
#   docker run --env-file .env -p 3000:3000 nexos-backend
# =============================================================================

# =============================================================================
# Stage 1 — deps
# Instala todas las dependencias (dev + prod) para compilar.
# Al separar este stage, Docker cachea node_modules mientras package.json no cambie.
# =============================================================================
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

# =============================================================================
# Stage 2 — builder
# Genera el cliente de Prisma y compila TypeScript a dist/.
# =============================================================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Genera el cliente Prisma usando el schema y el adaptador de pg.
# DATABASE_URL no es necesario en build-time — prisma generate solo lee el schema.
RUN npx prisma generate

RUN npm run build

# =============================================================================
# Stage 3 — runner
# Imagen mínima para producción. Solo copia el artefacto compilado.
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

# Timezone Uruguay — para que Pino y los logs del sistema muestren hora local.
# Las fechas en PostgreSQL siguen siendo UTC (TIMESTAMPTZ). Ver escrow-logic.md.
RUN apk add --no-cache tzdata
ENV TZ=America/Montevideo

ENV NODE_ENV=production

# Solo dependencias de producción
COPY package*.json ./
RUN npm ci --omit=dev

# Artefactos compilados
COPY --from=builder /app/dist ./dist

# Schema y client de Prisma (necesarios en runtime para las queries)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000

# Healthcheck de la app (requiere que el servidor esté respondiendo)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "dist/main"]
