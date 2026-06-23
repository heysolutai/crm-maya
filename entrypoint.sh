#!/bin/sh

# Build DATABASE_URL from individual variables if not set directly
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-crm_maya}"
fi

# Auto-run migrations on startup
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Rodando prisma db push..."
  node ./node_modules/prisma/build/index.js db push --schema=prisma/schema.prisma --accept-data-loss 2>&1
  if [ $? -eq 0 ]; then
    echo "[entrypoint] Banco de dados atualizado com sucesso!"
    # prisma db push NAO cria funcoes SQL. Aplicamos delete_company_cascade aqui
    # (idempotente). Sem isso, deletar empresa quebra em bancos novos.
    echo "[entrypoint] Aplicando funcoes SQL (prisma/db-functions.sql)..."
    node ./node_modules/prisma/build/index.js db execute --file prisma/db-functions.sql --schema prisma/schema.prisma 2>&1 \
      && echo "[entrypoint] Funcoes SQL aplicadas com sucesso!" \
      || echo "[entrypoint] AVISO: falha ao aplicar funcoes SQL (delete_company_cascade)."
  else
    echo "[entrypoint] ERRO no prisma db push. Verifique a DATABASE_URL."
  fi
else
  echo "[entrypoint] AVISO: DATABASE_URL nao definida. Pulando migrations."
fi

echo "[entrypoint] Iniciando servidor..."
exec node server.js
