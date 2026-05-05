#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  CRM — Script de Deploy para Linux (Ubuntu/Debian)
# ============================================================
#
#  Variaveis suportadas (env vars ou .deployrc em /var/www/<app>/):
#    APP_NAME          Nome da aplicacao          (default: crm-wyarp)
#    APP_DIR           Diretorio de instalacao    (default: /var/www/<app>)
#    APP_PORT          Porta da aplicacao         (default: 3000)
#    DOMAIN            Dominio do site            (ex: crm.seudominio.com.br)
#    GITHUB_REPO       Repo no formato user/repo  (ex: heysolutai/crm-wyarp)
#    GITHUB_TOKEN      PAT para repos privados    (opcional)
#    GITHUB_BRANCH     Branch a usar              (default: main)
#    NODE_VERSION      Versao do Node.js          (default: 20)
#    PG_DB             Nome do banco              (default: crm_wyarp)
#    PG_USER           Usuario do Postgres        (default: wyarp)
#
#  Uso:
#    Primeiro deploy (full — clona, builda, sobe servicos e SSL):
#      sudo DOMAIN=crm.dominio.com GITHUB_REPO=user/repo \\
#           GITHUB_TOKEN=ghp_xxx ./deploy.sh setup
#
#    Atualizar (git pull + rebuild):
#      ./deploy.sh update
#
#    Apenas reiniciar:       ./deploy.sh restart
#    Ver status:             ./deploy.sh status
#    Ver logs:               ./deploy.sh logs
#    Configurar SSL manual:  sudo ./deploy.sh ssl seudominio.com
#    Ver config atual:       ./deploy.sh config
# ============================================================

# ── Defaults (sobrescreviveis via env ou .deployrc) ──────────
APP_NAME="${APP_NAME:-crm-wyarp}"
APP_DIR_DEFAULT="/var/www/${APP_NAME}"
APP_DIR="${APP_DIR:-$APP_DIR_DEFAULT}"
APP_PORT="${APP_PORT:-3000}"
NODE_VERSION="${NODE_VERSION:-20}"
PG_DB="${PG_DB:-crm_wyarp}"
PG_USER="${PG_USER:-wyarp}"
DOMAIN="${DOMAIN:-}"
GITHUB_REPO="${GITHUB_REPO:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

# Carrega .deployrc do APP_DIR se existir (persistencia entre runs)
if [ -f "${APP_DIR}/.deployrc" ]; then
  # shellcheck disable=SC1091
  source "${APP_DIR}/.deployrc"
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }
err()  { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }
step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}"; }

# Prompt interativo se rodando em TTY e variavel vazia
prompt_if_empty() {
  local var_name="$1"
  local label="$2"
  local default="${3:-}"
  if [ -z "${!var_name:-}" ] && [ -t 0 ]; then
    local prompt_msg="${label}"
    [ -n "$default" ] && prompt_msg="${label} [${default}]"
    read -rp "  ${prompt_msg}: " value
    eval "${var_name}=\"\${value:-$default}\""
  fi
}

# Cria/atualiza .env com defaults sensatos. Preserva linhas existentes que ja
# foram editadas pelo operador — so adiciona as que estao faltando. Senhas e
# secrets sao gerados se nao existirem ainda.
#
# Args (via variaveis globais ou env):
#   APP_DIR PG_USER PG_DB PG_PASS DOMAIN APP_PORT
bootstrap_env() {
  local env_file="${APP_DIR}/.env"
  local proto="http"
  [ -f "${APP_DIR}/.ssl_enabled" ] && proto="https"

  # Helper: adiciona KEY=value se KEY nao existe ainda no arquivo
  upsert_env() {
    local key="$1"
    local value="$2"
    if [ -f "$env_file" ] && grep -q "^${key}=" "$env_file"; then
      return # ja existe — nao sobrescreve (operador pode ter editado)
    fi
    echo "${key}=\"${value}\"" >> "$env_file"
  }

  if [ ! -f "$env_file" ]; then
    log "Criando ${env_file} do zero"
    touch "$env_file"
    chmod 600 "$env_file"
  fi

  local app_url="${proto}://${DOMAIN:-localhost}"

  # Banco — sempre escreve com a senha atual (deploy.sh pode ter regerado)
  if grep -q "^DATABASE_URL=" "$env_file"; then
    sed -i "s|^DATABASE_URL=.*$|DATABASE_URL=\"postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}\"|" "$env_file"
  else
    echo "DATABASE_URL=\"postgresql://${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}\"" >> "$env_file"
  fi

  upsert_env "REDIS_URL" "redis://localhost:6379"
  upsert_env "NEXTAUTH_URL" "${app_url}"
  upsert_env "NEXT_PUBLIC_APP_URL" "${app_url}"
  upsert_env "NEXTAUTH_SECRET" "$(openssl rand -base64 32 | tr -d '\n')"
  upsert_env "INTERNAL_API_SECRET" "$(openssl rand -hex 32)"
  upsert_env "CRON_SECRET" "$(openssl rand -hex 32)"

  # Backblaze B2 — placeholders pro operador preencher
  upsert_env "B2_KEY_ID" ""
  upsert_env "B2_APP_KEY" ""
  upsert_env "B2_BUCKET_NAME" ""
  upsert_env "B2_BUCKET_REGION" "us-west-004"
  upsert_env "B2_ENDPOINT" "https://s3.us-west-004.backblazeb2.com"
  upsert_env "B2_PUBLIC_URL" ""

  # Opcionais
  upsert_env "DEFAULT_OPENAI_API_KEY" ""

  chmod 600 "$env_file"
  log ".env atualizado em ${env_file}"
}

# Salva as variaveis em .deployrc pro proximo run
save_deployrc() {
  local rc_file="${APP_DIR}/.deployrc"
  mkdir -p "$APP_DIR"
  cat > "$rc_file" <<RC
# Gerado por deploy.sh — variaveis persistidas entre runs
APP_NAME="${APP_NAME}"
APP_DIR="${APP_DIR}"
APP_PORT="${APP_PORT}"
NODE_VERSION="${NODE_VERSION}"
PG_DB="${PG_DB}"
PG_USER="${PG_USER}"
DOMAIN="${DOMAIN}"
GITHUB_REPO="${GITHUB_REPO}"
GITHUB_BRANCH="${GITHUB_BRANCH}"
RC
  # GITHUB_TOKEN fica em arquivo separado com permissao restrita
  if [ -n "$GITHUB_TOKEN" ]; then
    local token_file="${APP_DIR}/.github_token"
    echo "GITHUB_TOKEN=\"${GITHUB_TOKEN}\"" > "$token_file"
    chmod 600 "$token_file"
    echo "[ -f \"${token_file}\" ] && source \"${token_file}\"" >> "$rc_file"
  fi
  chmod 644 "$rc_file"
  log "Config salva em ${rc_file}"
}

# Mostra config atual
cmd_config() {
  echo ""
  step "Config atual"
  printf "  %-15s %s\n" "APP_NAME:"      "${APP_NAME}"
  printf "  %-15s %s\n" "APP_DIR:"       "${APP_DIR}"
  printf "  %-15s %s\n" "APP_PORT:"      "${APP_PORT}"
  printf "  %-15s %s\n" "DOMAIN:"        "${DOMAIN:-<nao definido>}"
  printf "  %-15s %s\n" "GITHUB_REPO:"   "${GITHUB_REPO:-<nao definido>}"
  printf "  %-15s %s\n" "GITHUB_BRANCH:" "${GITHUB_BRANCH}"
  printf "  %-15s %s\n" "GITHUB_TOKEN:"  "$([ -n "$GITHUB_TOKEN" ] && echo "<definido>" || echo "<nao definido>")"
  printf "  %-15s %s\n" "PG_DB:"         "${PG_DB}"
  printf "  %-15s %s\n" "PG_USER:"       "${PG_USER}"
  echo ""
}

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

  # PG_PASS fica em variavel pra ser usado no .env logo abaixo. Se o usuario ja
  # existe, pulamos a criacao mas ainda assim resetamos a senha (gera nova) —
  # garante que o operador nunca fica sem senha. Senha vai pro .env.
  PG_PASS=$(openssl rand -hex 16)
  if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" | grep -q 1; then
    log "Postgres user ${PG_USER} ja existe — resetando senha"
    sudo -u postgres psql -c "ALTER USER ${PG_USER} PASSWORD '${PG_PASS}';"
  else
    log "Criando usuario PostgreSQL: ${PG_USER}"
    sudo -u postgres createuser --superuser "${PG_USER}"
    sudo -u postgres psql -c "ALTER USER ${PG_USER} PASSWORD '${PG_PASS}';"
  fi

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

  step "7/8 — Clonando repositorio"
  prompt_if_empty GITHUB_REPO "GITHUB_REPO (user/repo)" ""
  [ -z "$GITHUB_REPO" ] && err "GITHUB_REPO obrigatorio para clonar"
  prompt_if_empty GITHUB_BRANCH "GITHUB_BRANCH" "main"

  if [ ! -d "${APP_DIR}/.git" ]; then
    mkdir -p "$(dirname "$APP_DIR")"
    local clone_url
    if [ -n "$GITHUB_TOKEN" ]; then
      clone_url="https://${GITHUB_TOKEN}@github.com/${GITHUB_REPO}.git"
      log "Clonando (com token)..."
    else
      clone_url="https://github.com/${GITHUB_REPO}.git"
      log "Clonando (publico)..."
    fi
    git clone --branch "$GITHUB_BRANCH" "$clone_url" "$APP_DIR" || err "Falha ao clonar"
    # Remove token da URL do remote pra nao vazar no git config
    if [ -n "$GITHUB_TOKEN" ]; then
      git -C "$APP_DIR" remote set-url origin "https://github.com/${GITHUB_REPO}.git"
    fi
  else
    log "Repo ja existe em ${APP_DIR}, pulando clone"
  fi

  # Copia deploy.sh pra dentro do APP_DIR (se rodamos fora)
  if [ -f "${APP_DIR}/deploy.sh" ]; then
    chmod +x "${APP_DIR}/deploy.sh"
  fi

  step "8/8 — Configurando Nginx"
  prompt_if_empty DOMAIN "DOMAIN (ex: crm.seudominio.com.br)" ""
  [ -z "$DOMAIN" ] && err "DOMAIN obrigatorio"

  # Map para Connection header: upgrade pra websocket, close pra requests normais
  cat > "/etc/nginx/conf.d/${APP_NAME}-upgrade.conf" <<'UPGRADE'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
UPGRADE

  cat > "/etc/nginx/sites-available/${APP_NAME}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    client_max_body_size 50M;

    # SSE: Server-Sent Events realtime (requer buffering off)
    location /api/conversations/events {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        gzip off;
        chunked_transfer_encoding off;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
NGINX
  ln -sf "/etc/nginx/sites-available/${APP_NAME}" "/etc/nginx/sites-enabled/"
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  log "Nginx configurado para ${DOMAIN}"

  # Salva config pra proximos runs
  save_deployrc

  # Bootstrap do .env: gera/preenche valores que sao deterministicos (Postgres,
  # Redis, NEXTAUTH_*) e secrets aleatorios. Operador so precisa adicionar
  # B2_*, DEFAULT_OPENAI_API_KEY e o que mais for opcional.
  bootstrap_env

  echo ""
  log "Setup concluido!"
  echo ""
  echo "  .env gerado automaticamente em ${APP_DIR}/.env"
  echo "  Postgres: ${PG_USER}:${PG_PASS}@localhost:5432/${PG_DB}"
  echo "  (senha tambem ja gravada no DATABASE_URL do .env)"
  echo ""
  echo "  Falta preencher (edite manualmente):"
  echo "  ─────────────────────────────────────────────"
  echo "  nano ${APP_DIR}/.env"
  echo ""
  echo "    B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME, B2_PUBLIC_URL"
  echo "    DEFAULT_OPENAI_API_KEY  (opcional — habilita transcricao)"
  echo "  ─────────────────────────────────────────────"
  echo ""
  echo "  Depois disso:"
  echo "    cd ${APP_DIR} && ./deploy.sh update    # primeiro build + start"
  echo "    sudo ./deploy.sh ssl                    # HTTPS"
  echo ""
}

# ──────────────────────────────────────────────
#  UPDATE — Pull + build + deploy
# ──────────────────────────────────────────────
cmd_update() {
  # Aceitar rodar de qualquer lugar: se tem package.json na pasta atual, usa ela
  if [ -f "package.json" ]; then
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

  # ORDEM:
  #   1) prisma db push — cria/atualiza tabelas e enums conforme schema.prisma
  #      (necessario PRIMEIRO em VPS limpa: as migrations SQL referenciam tabelas
  #      como `appointments`, `conversations`, `messages` que ainda nao existem)
  #   2) Migrations SQL manuais — normalizam dados, ajustam enums com estado
  #      legado, criam indexes parciais que o prisma nao suporta nativamente
  #
  # Tracking: cada migration SQL ja executada fica registrada na tabela
  # schema_migrations (nome + timestamp). Rodar o deploy.sh de novo pula
  # migrations ja aplicadas.

  DB_URL=$(grep -E "^DATABASE_URL=" .env | head -1 | cut -d'"' -f2 | tr -d "'")

  # 1) Prisma db push primeiro — schema base
  npx prisma db push 2>&1 || warn "db push falhou (pode ser normal se nao houve mudancas)"

  # 2) Migrations SQL manuais — depois das tabelas existirem
  if [ -d "prisma/migrations" ] && [ -n "$DB_URL" ]; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    " >/dev/null || err "Nao consegui criar/verificar tabela schema_migrations"

    for sql_file in prisma/migrations/*.sql; do
      [ -f "$sql_file" ] || continue
      name="$(basename "$sql_file")"

      applied=$(psql "$DB_URL" -tAc "SELECT 1 FROM schema_migrations WHERE name='$name' LIMIT 1" 2>/dev/null | tr -d '[:space:]')
      if [ "$applied" = "1" ]; then
        log "Pulando (ja aplicada): $name"
        continue
      fi

      log "Executando: $name"
      if psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$sql_file"; then
        psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
          "INSERT INTO schema_migrations(name) VALUES ('$name') ON CONFLICT DO NOTHING;" >/dev/null \
          || warn "Nao consegui registrar $name em schema_migrations (rode manualmente)"
        log "Aplicada: $name"
      else
        err "Migration falhou: $name. Veja erro acima e corrija antes de continuar."
      fi
    done
  fi

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
  # Usa DOMAIN do .deployrc/env se nao foi passado como argumento
  local domain="${2:-$DOMAIN}"
  if [ -z "$domain" ]; then
    err "Uso: sudo ./deploy.sh ssl [dominio]\n  Ou defina DOMAIN no .deployrc"
  fi

  if [ "$EUID" -ne 0 ]; then
    err "Rode com sudo: sudo ./deploy.sh ssl ${domain}"
  fi

  # Garante que o server_name no nginx esta correto
  sed -i "s/server_name _;/server_name ${domain};/" "/etc/nginx/sites-available/${APP_NAME}" 2>/dev/null || true
  nginx -t && systemctl reload nginx

  certbot --nginx -d "$domain" --non-interactive --agree-tos --redirect -m "admin@${domain}" || {
    warn "Certbot automatico falhou. Tente:"
    warn "  sudo certbot --nginx -d ${domain}"
  }

  # Atualiza DOMAIN no .deployrc
  DOMAIN="$domain"
  save_deployrc

  # Marca SSL como ativo + atualiza .env automatico (http -> https)
  touch "${APP_DIR}/.ssl_enabled"
  if [ -f "${APP_DIR}/.env" ]; then
    sed -i "s|^NEXTAUTH_URL=\"http://${domain}\"|NEXTAUTH_URL=\"https://${domain}\"|" "${APP_DIR}/.env"
    sed -i "s|^NEXT_PUBLIC_APP_URL=\"http://${domain}\"|NEXT_PUBLIC_APP_URL=\"https://${domain}\"|" "${APP_DIR}/.env"
    sed -i "s|^NEXTAUTH_URL=\"http://localhost\"|NEXTAUTH_URL=\"https://${domain}\"|" "${APP_DIR}/.env"
    sed -i "s|^NEXT_PUBLIC_APP_URL=\"http://localhost\"|NEXT_PUBLIC_APP_URL=\"https://${domain}\"|" "${APP_DIR}/.env"
    log ".env atualizado: NEXTAUTH_URL e NEXT_PUBLIC_APP_URL agora usam https"
  fi

  log "SSL configurado para ${domain}"
  warn "Rode './deploy.sh update' pra rebuildar com as URLs https"
}

# ──────────────────────────────────────────────
#  PG-RESET — Reseta a senha do Postgres e atualiza .env
# ──────────────────────────────────────────────
cmd_pg_reset() {
  if [ "$EUID" -ne 0 ]; then
    err "Rode com sudo: sudo ./deploy.sh pg-reset"
  fi
  if [ -f "package.json" ]; then APP_DIR="$(pwd)"; fi
  cd "$APP_DIR" || err "Diretorio ${APP_DIR} nao encontrado"

  local new_pass
  new_pass=$(openssl rand -hex 16)
  sudo -u postgres psql -c "ALTER USER ${PG_USER} PASSWORD '${new_pass}';" >/dev/null \
    || err "Falha ao resetar senha — usuario ${PG_USER} existe?"

  if [ -f .env ]; then
    sed -i "s|^DATABASE_URL=.*$|DATABASE_URL=\"postgresql://${PG_USER}:${new_pass}@localhost:5432/${PG_DB}\"|" .env
    log ".env atualizado com a nova senha"
  else
    warn ".env nao existe — nova senha: ${new_pass}"
  fi

  log "Senha do Postgres resetada com sucesso"
  log "Rode: ./deploy.sh restart   (pra app pegar a nova DATABASE_URL)"
}

# ──────────────────────────────────────────────
#  HELP
# ──────────────────────────────────────────────
cmd_help() {
  echo ""
  echo "  CRM — Script de Deploy"
  echo ""
  echo "  Uso: ./deploy.sh <comando>"
  echo ""
  echo "  Comandos:"
  echo "    setup           Instala tudo + clona repo + configura nginx — requer sudo"
  echo "                    (gera .env automatico com DATABASE_URL e secrets aleatorios)"
  echo "    update          Git pull + migrations + build + restart"
  echo "    restart         Apenas reiniciar a aplicacao"
  echo "    status          Ver status dos servicos, disco e memoria"
  echo "    logs [N]        Ver ultimas N linhas de log (padrao: 100)"
  echo "    ssl [DOMINIO]   Configurar HTTPS com Let's Encrypt + atualiza .env — requer sudo"
  echo "    pg-reset        Reseta senha do Postgres + atualiza DATABASE_URL no .env — requer sudo"
  echo "    config          Mostrar configuracao atual"
  echo ""
  echo "  Variaveis (env vars ou .deployrc em ${APP_DIR}):"
  echo "    DOMAIN          Dominio do site (ex: crm.dominio.com.br)"
  echo "    GITHUB_REPO     Repo (ex: user/nome-repo)"
  echo "    GITHUB_TOKEN    PAT para repos privados (opcional)"
  echo "    GITHUB_BRANCH   Branch a usar (default: main)"
  echo "    APP_NAME        Nome da app (default: crm-wyarp)"
  echo "    APP_DIR         Diretorio (default: /var/www/<app>)"
  echo "    PG_DB / PG_USER Banco e usuario Postgres"
  echo ""
  echo "  Primeiro deploy (one-liner):"
  echo "    sudo DOMAIN=crm.dominio.com GITHUB_REPO=user/repo \\\\"
  echo "         GITHUB_TOKEN=ghp_xxx ./deploy.sh setup"
  echo ""
  echo "    cd ${APP_DIR} && nano .env && ./deploy.sh update && sudo ./deploy.sh ssl"
  echo ""
}

# ──────────────────────────────────────────────
#  Router
# ──────────────────────────────────────────────
case "${1:-help}" in
  setup)    cmd_setup ;;
  update)   cmd_update ;;
  restart)  cmd_restart ;;
  status)   cmd_status ;;
  logs)     cmd_logs "$@" ;;
  ssl)      cmd_ssl "$@" ;;
  config)   cmd_config ;;
  pg-reset) cmd_pg_reset ;;
  help|-h|--help) cmd_help ;;
  *)        warn "Comando desconhecido: $1"; cmd_help ;;
esac
