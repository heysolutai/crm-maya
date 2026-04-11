#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  CRM Maya — Script de Deploy para Linux (Ubuntu/Debian)
# ============================================================
#
#  Uso:
#    Primeiro deploy (instala tudo):
#      chmod +x deploy.sh && sudo ./deploy.sh setup
#
#    Atualizar (git pull + rebuild):
#      ./deploy.sh update
#
#    Apenas reiniciar:       ./deploy.sh restart
#    Ver status:             ./deploy.sh status
#    Ver logs:               ./deploy.sh logs
#    Configurar SSL:         sudo ./deploy.sh ssl seudominio.com
# ============================================================

APP_NAME="crm-maya"
APP_DIR="/var/www/${APP_NAME}"
APP_PORT=3000
NODE_VERSION=20
PG_DB="crm_maya"
PG_USER="maya"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
err()  { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# ──────────────────────────────────────────────
#  SETUP — Primeiro deploy (rodar com sudo)
# ──────────────────────────────────────────────
cmd_setup() {
  if [ "$EUID" -ne 0 ]; then
    err "Rode com sudo: sudo ./deploy.sh setup"
  fi

  step "1/8 — Atualizando sistema"
  apt update && apt upgrade -y

  step "2/8 — Instalando dependencias do sistema"
  apt install -y git curl nginx certbot python3-certbot-nginx build-essential

  step "3/8 — Instalando Node.js ${NODE_VERSION}"
  if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt $NODE_VERSION ]]; then
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
    apt install -y nodejs
  fi
  log "Node $(node -v) / npm $(npm -v)"

  step "4/8 — Instalando PM2"
  npm install -g pm2

  step "5/8 — Configurando PostgreSQL"
  if ! command -v psql &> /dev/null; then
    apt install -y postgresql postgresql-contrib
    systemctl enable postgresql
    systemctl start postgresql
  fi

  sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1 || {
    log "Criando usuario PostgreSQL: ${PG_USER}"
    sudo -u postgres createuser --superuser "${PG_USER}"
    PG_PASS=$(openssl rand -hex 16)
    sudo -u postgres psql -c "ALTER USER ${PG_USER} PASSWORD '${PG_PASS}';"
    echo ""
    warn "=========================================="
    warn "  SENHA DO POSTGRES: ${PG_PASS}"
    warn "  ANOTE AGORA! Vai precisar no .env"
    warn "=========================================="
    echo ""
  }

  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 || {
    log "Criando banco: ${PG_DB}"
    sudo -u postgres createdb "${PG_DB}" -O "${PG_USER}"
  }

  step "6/8 — Configurando Redis"
  if ! command -v redis-server &> /dev/null; then
    apt install -y redis-server
  fi
  systemctl enable redis-server
  systemctl start redis-server

  step "7/8 — Preparando diretorio da aplicacao"
  if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    warn "Diretorio criado: ${APP_DIR}"
    warn "Clone o repositorio: git clone SEU_REPO ${APP_DIR}"
  fi

  step "8/8 — Configurando Nginx"
  cat > "/etc/nginx/sites-available/${APP_NAME}" <<'NGINX'
server {
    listen 80;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINX
  ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  log "Nginx configurado"

  # Gerar secrets de exemplo
  step "Secrets gerados para .env"
  echo ""
  echo "  NEXTAUTH_SECRET=\"$(openssl rand -base64 32)\""
  echo "  INTERNAL_API_SECRET=\"$(openssl rand -hex 32)\""
  echo "  CRON_SECRET=\"$(openssl rand -hex 32)\""
  echo ""

  echo ""
  log "Setup concluido!"
  echo ""
  echo "  Proximos passos:"
  echo "  ─────────────────────────────────────────────"
  echo "  1. Clone o repo:    git clone SEU_REPO ${APP_DIR}"
  echo "  2. Configure .env:  cp ${APP_DIR}/.env.example ${APP_DIR}/.env"
  echo "                      nano ${APP_DIR}/.env"
  echo "  3. Deploy:          cd ${APP_DIR} && ./deploy.sh update"
  echo "  4. SSL:             sudo ./deploy.sh ssl seudominio.com"
  echo "  ─────────────────────────────────────────────"
  echo ""
}

# ──────────────────────────────────────────────
#  UPDATE — Pull + build + deploy
# ──────────────────────────────────────────────
cmd_update() {
  # Aceitar rodar de qualquer lugar (se esta no APP_DIR ou nao)
  if [ -f "package.json" ] && grep -q "crm-maya" package.json 2>/dev/null; then
    APP_DIR="$(pwd)"
  fi
  cd "$APP_DIR" || err "Diretorio ${APP_DIR} nao encontrado."

  if [ ! -f ".env" ]; then
    err "Arquivo .env nao encontrado!\n  cp .env.example .env && nano .env"
  fi

  step "1/7 — Git pull"
  git pull --ff-only 2>/dev/null || {
    warn "Fast-forward falhou. Tentando com stash..."
    git stash
    git pull --ff-only
    git stash pop 2>/dev/null || true
  }

  step "2/7 — Instalando dependencias"
  npm ci

  step "3/7 — Gerando Prisma Client"
  npx prisma generate

  step "4/7 — Aplicando schema no banco"

  # Migrations SQL manuais PRIMEIRO (limpam duplicatas, normalizam dados, etc)
  # antes do prisma db push, que pode falhar se os dados nao estiverem preparados
  DB_URL=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d'"' -f2 | tr -d "'")
  if [ -d "prisma/migrations" ] && [ -n "$DB_URL" ]; then
    for sql_file in prisma/migrations/*.sql; do
      [ -f "$sql_file" ] || continue
      log "Executando: $(basename "$sql_file")"
      psql "$DB_URL" -f "$sql_file" 2>/dev/null || warn "Ja aplicada ou erro: $(basename "$sql_file")"
    done
  fi

  # Prisma db push depois, aplicando o schema (unique constraints, colunas novas, etc)
  npx prisma db push --skip-generate 2>&1 || warn "db push falhou (pode ser normal se nao houve mudancas)"

  # Indexes
  if [ -f "prisma/indexes.sql" ] && [ -n "$DB_URL" ]; then
    log "Aplicando indexes..."
    psql "$DB_URL" -f prisma/indexes.sql 2>/dev/null || true
  fi

  step "5/7 — Build"
  npm run build || err "Build falhou!"

  step "6/7 — Copiando arquivos estaticos (standalone)"
  if [ -d ".next/standalone" ]; then
    cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
    cp -r public .next/standalone/public 2>/dev/null || true
    cp .env .next/standalone/.env 2>/dev/null || true
    log "Standalone preparado"
    STANDALONE=true
  else
    STANDALONE=false
  fi

  step "7/7 — Reiniciando aplicacao"
  if [ "$STANDALONE" = true ]; then
    if pm2 describe "$APP_NAME" &>/dev/null; then
      pm2 restart "$APP_NAME" --update-env
    else
      pm2 start .next/standalone/server.js --name "$APP_NAME" --update-env
    fi
  else
    if pm2 describe "$APP_NAME" &>/dev/null; then
      pm2 restart "$APP_NAME" --update-env
    else
      pm2 start npm --name "$APP_NAME" -- start
    fi
  fi

  pm2 save

  echo ""
  log "Deploy concluido!"
  echo ""
  pm2 status "$APP_NAME"
  echo ""
}

# ──────────────────────────────────────────────
#  RESTART
# ──────────────────────────────────────────────
cmd_restart() {
  if pm2 describe "$APP_NAME" &>/dev/null; then
    pm2 restart "$APP_NAME" --update-env
    log "Reiniciado"
    pm2 status "$APP_NAME"
  else
    err "App nao esta rodando. Rode './deploy.sh update' primeiro."
  fi
}

# ──────────────────────────────────────────────
#  STATUS
# ──────────────────────────────────────────────
cmd_status() {
  echo ""
  step "Aplicacao"
  pm2 status "$APP_NAME" 2>/dev/null || warn "PM2: app nao encontrada"

  step "Servicos"
  printf "  %-14s %s\n" "PostgreSQL:" "$(systemctl is-active postgresql 2>/dev/null || echo 'nao instalado')"
  printf "  %-14s %s\n" "Redis:" "$(systemctl is-active redis-server 2>/dev/null || echo 'nao instalado')"
  printf "  %-14s %s\n" "Nginx:" "$(systemctl is-active nginx 2>/dev/null || echo 'nao instalado')"

  step "Disco"
  df -h / | tail -1 | awk '{printf "  Usado: %s / %s (%s)\n", $3, $2, $5}'

  step "Memoria"
  free -h | awk '/Mem/{printf "  Usada: %s / %s\n", $3, $2}'
  echo ""
}

# ──────────────────────────────────────────────
#  LOGS
# ──────────────────────────────────────────────
cmd_logs() {
  local lines="${2:-100}"
  pm2 logs "$APP_NAME" --lines "$lines"
}

# ──────────────────────────────────────────────
#  SSL — Configurar HTTPS com Let's Encrypt
# ──────────────────────────────────────────────
cmd_ssl() {
  local domain="${2:-}"
  if [ -z "$domain" ]; then
    err "Uso: sudo ./deploy.sh ssl seudominio.com"
  fi

  if [ "$EUID" -ne 0 ]; then
    err "Rode com sudo: sudo ./deploy.sh ssl ${domain}"
  fi

  # Atualizar server_name no nginx
  sed -i "s/server_name _;/server_name ${domain};/" "/etc/nginx/sites-available/${APP_NAME}" 2>/dev/null || true
  sed -i "s/server_name .*/server_name ${domain};/" "/etc/nginx/sites-available/${APP_NAME}" 2>/dev/null || true
  nginx -t && systemctl reload nginx

  certbot --nginx -d "$domain" --non-interactive --agree-tos --redirect -m "admin@${domain}" || {
    warn "Certbot automatico falhou. Tente:"
    warn "  sudo certbot --nginx -d ${domain}"
  }

  log "SSL configurado para ${domain}"
  warn "Atualize NEXTAUTH_URL e NEXT_PUBLIC_APP_URL no .env para https://${domain}"
  warn "Depois rode: ./deploy.sh update"
}

# ──────────────────────────────────────────────
#  HELP
# ──────────────────────────────────────────────
cmd_help() {
  echo ""
  echo "  CRM Maya — Script de Deploy"
  echo ""
  echo "  Uso: ./deploy.sh <comando>"
  echo ""
  echo "  Comandos:"
  echo "    setup           Instalar tudo (PostgreSQL, Redis, Nginx, Node) — requer sudo"
  echo "    update          Git pull + build + restart"
  echo "    restart         Apenas reiniciar a aplicacao"
  echo "    status          Ver status dos servicos, disco e memoria"
  echo "    logs [N]        Ver ultimas N linhas de log (padrao: 100)"
  echo "    ssl DOMINIO     Configurar HTTPS com Let's Encrypt — requer sudo"
  echo ""
  echo "  Primeiro deploy:"
  echo "    sudo ./deploy.sh setup"
  echo "    git clone SEU_REPO /var/www/crm-maya"
  echo "    cd /var/www/crm-maya"
  echo "    cp .env.example .env && nano .env"
  echo "    ./deploy.sh update"
  echo "    sudo ./deploy.sh ssl seudominio.com"
  echo ""
}

# ──────────────────────────────────────────────
#  Router
# ──────────────────────────────────────────────
case "${1:-help}" in
  setup)   cmd_setup ;;
  update)  cmd_update ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  logs)    cmd_logs "$@" ;;
  ssl)     cmd_ssl "$@" ;;
  help|-h|--help) cmd_help ;;
  *)       warn "Comando desconhecido: $1"; cmd_help ;;
esac
