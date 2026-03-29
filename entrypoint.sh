#!/bin/sh

# Build DATABASE_URL from individual variables if not set directly
if [ -z "$DATABASE_URL" ] && [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER:-postgres}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT:-5432}/${DB_NAME:-crm_maya}"
fi

exec node server.js
