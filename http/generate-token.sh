#!/usr/bin/env bash
#
# Genera un JWT compatible con Supabase para testing local.
# Uso: bash http/generate-token.sh <email> <supabase_uid>
#
# Ejemplo:
#   bash http/generate-token.sh demo.pro@nexos.local 00000000-0000-4000-8000-000000000002
#
# Requisitos: node, dotenv en node_modules (ya viene con el proyecto)

set -euo pipefail

EMAIL="${1:?Uso: $0 <email> <supabase_uid>}"
UID_VAL="${2:?Uso: $0 <email> <supabase_uid>}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

JWT_SECRET=$(grep -m1 '^SUPABASE_JWT_SECRET=' "$PROJECT_DIR/.env" | cut -d= -f2-)

if [ -z "$JWT_SECRET" ]; then
  echo "ERROR: SUPABASE_JWT_SECRET no encontrado en .env" >&2
  exit 1
fi

TOKEN=$(node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    sub: '$UID_VAL',
    email: '$EMAIL',
    role: 'authenticated',
    aud: 'authenticated',
  },
  '$JWT_SECRET',
  { expiresIn: '1h' }
);
console.log(token);
")

echo ""
echo "=== JWT generado (expira en 1h) ==="
echo ""
echo "$TOKEN"
echo ""
echo "=== Para usar en REST Client: ==="
echo "@authToken = $TOKEN"
echo ""
