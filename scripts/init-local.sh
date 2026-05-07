#!/bin/bash
# =============================================================================
# NEXOS — Script de Inicialización del Entorno Local
# HRProgrammers
#
# Uso:
#   bash scripts/init-local.sh
#
# Qué hace:
#   1. Levanta PostgreSQL+PostGIS, Redis y MongoDB con Docker Compose.
#   2. Espera a que PostgreSQL esté disponible y aceptando conexiones.
#   3. Genera el cliente Prisma.
#   4. (Cuando existan migraciones) Ejecuta prisma migrate dev.
#
# Pre-requisitos:
#   - Docker y Docker Compose instalados.
#   - Archivo .env configurado (cp .env.example .env).
#   - Node.js 20+ y npm instalados localmente.
# =============================================================================

set -euo pipefail

# Colores para output legible
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "============================================="
echo "  Nexos — Inicialización del Entorno Local"
echo "  HRProgrammers"
echo "============================================="
echo ""

# --- Verificar pre-requisitos ---
if ! command -v docker &> /dev/null; then
  echo -e "${RED}[ERROR] Docker no está instalado. Instálalo desde https://docs.docker.com/get-docker/${NC}"
  exit 1
fi

if [ ! -f ".env" ]; then
  echo -e "${YELLOW}[AVISO] No se encontró el archivo .env.${NC}"
  echo "  Copiando .env.example → .env ..."
  cp .env.example .env
  echo -e "${YELLOW}  Edita .env con tus credenciales antes de continuar.${NC}"
  echo ""
fi

# --- [1/4] Levantar servicios Docker ---
echo -e "${GREEN}[1/4] Levantando servicios Docker (Postgres, Redis, MongoDB)...${NC}"
docker compose up -d
echo ""

# --- [2/4] Esperar a que PostgreSQL esté listo ---
echo -e "${GREEN}[2/4] Esperando a que PostgreSQL acepte conexiones...${NC}"
MAX_RETRIES=30
RETRY_COUNT=0

until docker exec nexos_postgres pg_isready -U nexos -d nexos_db > /dev/null 2>&1; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo -e "${RED}[ERROR] PostgreSQL no respondió después de ${MAX_RETRIES} intentos.${NC}"
    echo "  Revisa los logs con: docker compose logs postgres"
    exit 1
  fi
  printf '.'
  sleep 2
done

echo -e " ${GREEN}OK${NC}"
echo ""

# --- [3/4] Generar cliente Prisma ---
echo -e "${GREEN}[3/4] Generando cliente Prisma...${NC}"
npx prisma generate
echo ""

# --- [4/4] Migraciones (descomentar cuando existan) ---
# echo -e "${GREEN}[4/4] Ejecutando migraciones de base de datos...${NC}"
# npx prisma migrate dev
# echo ""

# --- Listo ---
echo "============================================="
echo -e "${GREEN}  Entorno local listo.${NC}"
echo ""
echo "  Servicios activos:"
echo "    PostgreSQL  → localhost:5432 (nexos_db)"
echo "    Redis       → localhost:6379"
echo "    MongoDB     → localhost:27017 (nexos_chats)"
echo ""
echo "  Próximo paso:"
echo "    npm run start:dev"
echo "============================================="
echo ""
