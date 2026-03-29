#!/bin/bash
set -e

APP_NAME="crm-maya"

echo "========================================="
echo "  Deploy CRM Maya"
echo "========================================="

# 1. Pull latest code
echo "[1/6] Puxando código..."
git pull origin main

# 2. Install dependencies
echo "[2/6] Instalando dependências..."
npm ci

# 3. Run migrations
echo "[3/6] Rodando migrations..."
npx prisma generate
npx prisma db push

# 4. Build
echo "[4/6] Buildando..."
npm run build

# 5. Copy static files to standalone
echo "[5/6] Copiando arquivos estáticos..."
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp .env.production .next/standalone/.env.production 2>/dev/null || cp .env .next/standalone/.env

# 6. Restart PM2
echo "[6/6] Reiniciando..."
pm2 restart "$APP_NAME" --update-env 2>/dev/null || pm2 start .next/standalone/server.js --name "$APP_NAME"

echo "========================================="
echo "  Deploy concluído!"
echo "========================================="
pm2 status "$APP_NAME"
