#!/bin/sh

# Build DATABASE_URL from individual variables if not set directly
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-crm_maya}"
fi

# Auto-run migrations on startup
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Rodando prisma db push..."
  npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || echo "[entrypoint] Migration falhou, continuando..."
fi

exec node server.js
