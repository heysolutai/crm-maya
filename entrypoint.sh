#!/bin/sh

# Build DATABASE_URL from individual variables if not set directly
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-crm_maya}"
fi

# Auto-run migrations on startup
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Rodando prisma db push..."
  node ./node_modules/prisma/build/index.js db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss 2>&1
  if [ $? -eq 0 ]; then
    echo "[entrypoint] Banco de dados atualizado com sucesso!"
  else
    echo "[entrypoint] ERRO no prisma db push. Verifique a DATABASE_URL."
  fi
else
  echo "[entrypoint] AVISO: DATABASE_URL nao definida. Pulando migrations."
fi

echo "[entrypoint] Iniciando servidor..."
exec node server.js
