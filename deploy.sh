#!/bin/bash
set -e

echo "=== Deploy CRM Next ==="

# Install dependencies
echo "[1/5] Instalando dependencias..."
npm install

# Build
echo "[2/5] Executando build..."
npm run build

# Copy static files to standalone
echo "[3/5] Copiando arquivos estaticos..."
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public

# Copy env
echo "[4/5] Copiando .env..."
cp .env .next/standalone/.env

# Restart PM2
echo "[5/5] Reiniciando PM2..."
pm2 restart crm-next --update-env 2>/dev/null || pm2 start .next/standalone/server.js --name crm-next

echo "=== Deploy concluido! ==="
