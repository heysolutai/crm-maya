#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  rebuild.sh — Atualiza a aplicacao com o minimo de trabalho
# ============================================================
#
#  Roda dentro do APP_DIR (ex: /var/www/crm-wyarp) e faz:
#    1. git pull
#    2. npm ci (so se package-lock.json mudou)
#    3. prisma generate (so se schema.prisma mudou)
#    4. migrations SQL (idempotentes)
#    5. prisma db push
#    6. next build
#    7. pm2 restart
#
#  Carrega config de ./.deployrc se existir, senao usa defaults.
# ============================================================

APP_NAME_DEFAULT="crm-wyarp"
APP_DIR="$(pwd)"

# Carrega .deployrc (onde o setup salvou APP_NAME, PG_DB etc)
if [ -f "${APP_DIR}/.deployrc" ]; then
  # shellcheck disable=SC1091
  source "${APP_DIR}/.deployrc"
fi
APP_NAME="${APP_NAME:-$APP_NAME_DEFAULT}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

log()  { echo -e "${GREEN}[REBUILD]${NC} $1"; }
skip() { echo -e "${GRAY}[SKIP]${NC}    $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC}  $1"; }
err()  { echo -e "${RED}[ERRO]${NC}   $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Hash helper (MD5 do conteudo, funciona em qualquer Linux)
hash_file() {
  [ -f "$1" ] || { echo "-"; return; }
  md5sum "$1" 2>/dev/null | awk '{print $1}'
}

# ── Checks iniciais ──────────────────────────────
[ -f "package.json" ] || err "package.json nao encontrado. Rode dentro do APP_DIR."
[ -f ".env" ]         || err ".env nao encontrado. Configure antes de rebuildar."

# ── 1. Git pull ──────────────────────────────────
step "1/6 — Git pull"
HASH_PKG_BEFORE=$(hash_file "package-lock.json")
HASH_SCHEMA_BEFORE=$(hash_file "prisma/schema.prisma")
BEFORE_COMMIT=$(git rev-parse HEAD)

git pull --ff-only 2>/dev/null || {
  warn "Fast-forward falhou. Tentando com stash..."
  git stash
  git pull --ff-only
  git stash pop 2>/dev/null || true
}

AFTER_COMMIT=$(git rev-parse HEAD)

if [ "$BEFORE_COMMIT" = "$AFTER_COMMIT" ]; then
  log "Nenhum commit novo. Rebuildando mesmo assim (ambiente pode ter mudado)."
else
  COMMITS_COUNT=$(git rev-list --count "$BEFORE_COMMIT".."$AFTER_COMMIT")
  log "${COMMITS_COUNT} commit(s) novo(s): $(git log --oneline -1)"
fi

HASH_PKG_AFTER=$(hash_file "package-lock.json")
HASH_SCHEMA_AFTER=$(hash_file "prisma/schema.prisma")

# ── 2. npm ci (so se package-lock mudou) ────────
step "2/6 — Dependencias"
if [ "$HASH_PKG_BEFORE" != "$HASH_PKG_AFTER" ]; then
  log "package-lock.json mudou — rodando npm ci"
  npm ci
else
  skip "package-lock.json inalterado"
fi

# ── 3. Prisma generate (so se schema mudou) ─────
step "3/6 — Prisma Client"
if [ "$HASH_SCHEMA_BEFORE" != "$HASH_SCHEMA_AFTER" ] || [ ! -d "node_modules/.prisma" ]; then
  log "Gerando Prisma Client"
  npx prisma generate
else
  skip "schema.prisma inalterado"
fi

# ── 4. Migrations + db push ─────────────────────
step "4/6 — Banco de dados"
DB_URL=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d'"' -f2 | tr -d "'")

if [ -d "prisma/migrations" ] && [ -n "$DB_URL" ]; then
  for sql_file in prisma/migrations/*.sql; do
    [ -f "$sql_file" ] || continue
    log "Aplicando: $(basename "$sql_file")"
    psql "$DB_URL" -f "$sql_file" 2>/dev/null || warn "$(basename "$sql_file"): ja aplicada ou conflito"
  done
fi

npx prisma db push 2>&1 | tail -5 || warn "db push com warnings"

if [ -f "prisma/indexes.sql" ] && [ -n "$DB_URL" ]; then
  log "Aplicando indexes..."
  psql "$DB_URL" -f prisma/indexes.sql 2>/dev/null || true
fi

# ── 5. Build ────────────────────────────────────
step "5/6 — Build Next.js"
npm run build || err "Build falhou!"

# Copia estaticos e .env para o standalone
if [ -d ".next/standalone" ]; then
  cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
  cp -r public .next/standalone/public 2>/dev/null || true
  cp .env .next/standalone/.env 2>/dev/null || true
  STANDALONE=true
else
  STANDALONE=false
fi

# ── 6. Restart PM2 ──────────────────────────────
step "6/6 — Restart"
if pm2 describe "$APP_NAME" &>/dev/null; then
  pm2 restart "$APP_NAME" --update-env
else
  if [ "$STANDALONE" = true ]; then
    pm2 start .next/standalone/server.js --name "$APP_NAME" --update-env
  else
    pm2 start npm --name "$APP_NAME" -- start
  fi
fi
pm2 save > /dev/null

echo ""
log "Rebuild concluido."
pm2 status "$APP_NAME"
echo ""
