# CRM Maya — Deploy em VPS com Supabase Self-Hosted

Tutorial completo para subir o CRM Maya em um servidor proprio (VPS) com PostgreSQL, Redis e Supabase self-hosted.

---

## Arquitetura Final

```
┌─────────────────────────────────────────────────┐
│                    VPS (Ubuntu)                  │
│                                                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Supabase │  │   Redis   │  │   Next.js    │  │
│  │ (Docker) │  │  (Docker) │  │   (Docker)   │  │
│  │          │  │           │  │              │  │
│  │ Postgres │  │  BullMQ   │  │  App + API   │  │
│  │ Auth     │  │  Queues   │  │  Workers     │  │
│  │ Storage  │  │           │  │              │  │
│  │ REST API │  │           │  │              │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │             Nginx (Reverse Proxy)        │    │
│  │             + Certbot SSL                │    │
│  └──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

**Por que Supabase self-hosted (e nao PostgreSQL puro)?**
- O CRM usa Supabase Auth (login, JWT, sessions) em **todo** o codigo
- Usa o SDK `@supabase/ssr` no middleware e em todos os hooks
- Usa Row Level Security (RLS) com JWT claims
- Usa `createBrowserClient` / `createServerClient` / `createAdminClient`
- Migrar para auth puro exigiria reescrever ~50 arquivos

Com Supabase self-hosted, **zero mudanca de codigo** e necessaria.

---

## Requisitos do Servidor

| Recurso | Minimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPUs | 4 vCPUs |
| RAM | 4 GB | 8 GB |
| Disco | 40 GB SSD | 80 GB SSD |
| SO | Ubuntu 22.04+ | Ubuntu 24.04 LTS |
| Portas | 80, 443 | 80, 443 |

**Dominio:** Voce precisa de um dominio apontando para o IP do servidor (ex: `crm.seudominio.com.br`).

---

## Passo 1 — Preparar o Servidor

```bash
# Conectar no servidor
ssh root@SEU_IP

# Atualizar pacotes
apt update && apt upgrade -y

# Instalar dependencias basicas
apt install -y curl git ufw

# Configurar firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable

# Instalar Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# Verificar instalacao
docker --version
docker compose version

# Criar usuario para deploy (nao rodar como root)
adduser deploy
usermod -aG docker deploy
su - deploy
```

---

## Passo 2 — Instalar Supabase Self-Hosted

```bash
# Como usuario deploy
cd ~

# Clonar o repositorio oficial do Supabase
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker

# Copiar o .env de exemplo
cp .env.example .env
```

### Editar o arquivo `.env` do Supabase:

```bash
nano .env
```

**Variaveis OBRIGATORIAS para alterar:**

```ini
# ===== PASSWORDS (GERE SENHAS FORTES!) =====
# Gerar: openssl rand -hex 32

POSTGRES_PASSWORD=SUA_SENHA_FORTE_AQUI
JWT_SECRET=SUA_JWT_SECRET_AQUI_MIN_32_CHARS
ANON_KEY=GERAR_COM_COMANDO_ABAIXO
SERVICE_ROLE_KEY=GERAR_COM_COMANDO_ABAIXO
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=SUA_SENHA_DASHBOARD

# ===== URLS =====
SITE_URL=https://crm.seudominio.com.br
API_EXTERNAL_URL=https://api.seudominio.com.br
SUPABASE_PUBLIC_URL=https://api.seudominio.com.br

# ===== SMTP (para emails de confirmacao/reset) =====
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-app-password
SMTP_SENDER_NAME=CRM Maya
SMTP_ADMIN_EMAIL=seu-email@gmail.com

# ===== STORAGE =====
STORAGE_BACKEND=file
FILE_SIZE_LIMIT=52428800
```

### Gerar as chaves JWT (ANON_KEY e SERVICE_ROLE_KEY):

```bash
# Instalar a CLI do Supabase (se nao tiver)
npx supabase@latest --version

# Ou gerar manualmente no https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
# Use o JWT_SECRET que voce definiu acima

# Alternativa: usar o script embutido
cd ~/supabase/docker
docker compose up -d supabase-db
# Aguardar o banco subir, depois parar
docker compose down
```

> **Dica:** Use o site https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys
> para gerar `ANON_KEY` e `SERVICE_ROLE_KEY` a partir do seu `JWT_SECRET`.

### Subir o Supabase:

```bash
cd ~/supabase/docker
docker compose up -d
```

Verificar se esta rodando:

```bash
docker compose ps
# Todos os servicos devem estar "healthy" ou "running"
```

Servicos que estarao rodando:
- **supabase-db** (PostgreSQL 15) — porta 5432
- **supabase-auth** (GoTrue) — porta 9999
- **supabase-rest** (PostgREST) — porta 3000
- **supabase-realtime** — porta 4000
- **supabase-storage** — porta 5000
- **supabase-kong** (API Gateway) — porta 8000
- **supabase-studio** (Dashboard) — porta 3000

### Testar acesso:

```bash
# API deve responder
curl http://localhost:8000/rest/v1/ -H "apikey: SUA_ANON_KEY"

# Studio (dashboard visual)
# Acessar: http://SEU_IP:8000
```

---

## Passo 3 — Executar as Migrations do Banco

```bash
# Como usuario deploy
cd ~
git clone SEU_REPO_GIT crm-maya
cd crm-maya

# Conectar no PostgreSQL do Supabase e rodar as migrations
# A senha e a POSTGRES_PASSWORD do .env do Supabase

# Rodar na ORDEM CORRETA:
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000000_extensions_enums.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000001_core_tables.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000002_clients.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000003_conversations_messages.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000004_sales_products.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000005_appointments_scheduling.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000006_integrations.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000007_ai_knowledge.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000008_analytics_system.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000009_views_functions.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000010_rls_policies.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260101000011_triggers.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260325_departments_pipelines.sql
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres -f supabase/migrations/20260326_department_roundrobin_presence.sql
```

**Ou, script automatico:**

```bash
# Criar script para rodar todas as migrations
cat > run-migrations.sh << 'SCRIPT'
#!/bin/bash
DB_HOST=${1:-localhost}
DB_PASS=${2:-postgres}

MIGRATIONS=(
  "20260101000000_extensions_enums.sql"
  "20260101000001_core_tables.sql"
  "20260101000002_clients.sql"
  "20260101000003_conversations_messages.sql"
  "20260101000004_sales_products.sql"
  "20260101000005_appointments_scheduling.sql"
  "20260101000006_integrations.sql"
  "20260101000007_ai_knowledge.sql"
  "20260101000008_analytics_system.sql"
  "20260101000009_views_functions.sql"
  "20260101000010_rls_policies.sql"
  "20260101000011_triggers.sql"
  "20260325_departments_pipelines.sql"
  "20260326_department_roundrobin_presence.sql"
)

for file in "${MIGRATIONS[@]}"; do
  echo "▶ Executando: $file"
  PGPASSWORD=$DB_PASS psql -h $DB_HOST -U postgres -d postgres -f "supabase/migrations/$file"
  if [ $? -ne 0 ]; then
    echo "✗ ERRO em $file — abortando"
    exit 1
  fi
  echo "✓ OK"
done

echo ""
echo "✅ Todas as migrations executadas com sucesso!"
SCRIPT

chmod +x run-migrations.sh
./run-migrations.sh localhost SUA_SENHA_FORTE
```

---

## Passo 4 — Criar o Primeiro Super Admin

```bash
# Conectar no PostgreSQL
PGPASSWORD=SUA_SENHA_FORTE psql -h localhost -U postgres -d postgres
```

```sql
-- 1. Criar o usuario via API do Supabase Auth (recomendado)
-- OU inserir manualmente:

-- Primeiro, crie o usuario pela interface do Supabase Studio
-- (http://SEU_IP:8000 > Authentication > Add User)
-- Email: admin@seudominio.com.br
-- Senha: SuaSenhaForte123!

-- Depois, pegue o UUID do usuario criado e rode:
INSERT INTO user_roles (user_id, role)
VALUES ('UUID-DO-USUARIO-AQUI', 'super_admin');

-- Verificar
SELECT u.email, ur.role FROM auth.users u
JOIN user_roles ur ON ur.user_id = u.id;
```

---

## Passo 5 — Configurar o CRM (Docker Compose)

Crie o arquivo `docker-compose.prod.yml` na raiz do projeto:

```bash
cd ~/crm-maya
nano docker-compose.prod.yml
```

```yaml
services:
  app:
    build:
      context: .
      args:
        NEXT_PUBLIC_SUPABASE_URL: "https://api.seudominio.com.br"
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "SUA_ANON_KEY"
        NEXT_PUBLIC_SUPABASE_PROJECT_ID: "self-hosted"
        NEXT_PUBLIC_APP_URL: "https://crm.seudominio.com.br"
        NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL: ""
    ports:
      - "3001:3000"
    env_file:
      - .env.production
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru --requirepass SUA_SENHA_REDIS
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "SUA_SENHA_REDIS", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3
    restart: unless-stopped

volumes:
  redis_data:
```

### Criar o `.env.production`:

```bash
nano .env.production
```

```ini
# ============================================
# CRM Maya — Producao
# ============================================

# ── SUPABASE ──
NEXT_PUBLIC_SUPABASE_URL=https://api.seudominio.com.br
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_ANON_KEY_GERADA
NEXT_PUBLIC_SUPABASE_PROJECT_ID=self-hosted
SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY_GERADA

# ── APP ──
NEXT_PUBLIC_APP_URL=https://crm.seudominio.com.br
NODE_ENV=production

# ── REDIS ──
REDIS_URL=redis://:SUA_SENHA_REDIS@redis:6379

# ── SEGURANCA ──
# Gere com: openssl rand -hex 32
INTERNAL_API_SECRET=GERAR_AQUI
CRON_SECRET=GERAR_AQUI

# ── WHATSAPP (UAZAPI) ──
WHATSAPP_ADMIN_TOKEN=
EXTERNAL_WEBHOOK_URL=https://crm.seudominio.com.br/api/webhooks/whatsapp
UAZAPI_BASE_URL=https://heysolut.uazapi.com

# ── IA / N8N ──
N8N_AI_WEBHOOK_URL=
N8N_FAQ_UPLOAD_WEBHOOK_URL=
NEXT_PUBLIC_N8N_FAQ_WEBHOOK_URL=
DEFAULT_OPENAI_API_KEY=

# ── GOOGLE CALENDAR (opcional) ──
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# ── KNOWLEDGE ──
KNOWLEDGE_WEBHOOK_URL=
```

### Build e Run:

```bash
cd ~/crm-maya
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Verificar logs
docker compose -f docker-compose.prod.yml logs -f app
```

---

## Passo 6 — Nginx + SSL

```bash
# Como root
apt install -y nginx certbot python3-certbot-nginx
```

### Configurar Nginx:

```bash
nano /etc/nginx/sites-available/crm-maya
```

```nginx
# ── CRM App ──
server {
    listen 80;
    server_name crm.seudominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;

        # WebSocket support (para realtime)
        proxy_buffering off;
    }

    # Webhook do WhatsApp precisa de maior timeout
    location /api/webhooks/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120;
        client_max_body_size 50M;
    }
}

# ── Supabase API (Kong Gateway) ──
server {
    listen 80;
    server_name api.seudominio.com.br;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
        client_max_body_size 50M;
    }
}
```

```bash
# Ativar o site
ln -s /etc/nginx/sites-available/crm-maya /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default

# Testar configuracao
nginx -t

# Reiniciar
systemctl restart nginx

# Gerar certificado SSL
certbot --nginx -d crm.seudominio.com.br -d api.seudominio.com.br

# Auto-renovar (ja configurado pelo certbot, mas verificar)
certbot renew --dry-run
```

---

## Passo 7 — DNS

No painel do seu provedor de dominio, crie os registros:

| Tipo | Nome | Valor |
|------|------|-------|
| A | `crm` | `IP_DO_SERVIDOR` |
| A | `api` | `IP_DO_SERVIDOR` |

Aguarde a propagacao DNS (pode levar ate 24h, geralmente 5-30 min).

---

## Passo 8 — Verificar Tudo

```bash
# 1. Testar Supabase API
curl https://api.seudominio.com.br/rest/v1/ \
  -H "apikey: SUA_ANON_KEY"

# 2. Testar o CRM
curl -I https://crm.seudominio.com.br

# 3. Verificar containers
docker ps

# 4. Verificar logs do CRM
docker compose -f ~/crm-maya/docker-compose.prod.yml logs -f app

# 5. Verificar logs do Supabase
cd ~/supabase/docker && docker compose logs -f
```

---

## Checklist Final

- [ ] Servidor Ubuntu atualizado
- [ ] Docker + Docker Compose instalados
- [ ] Firewall configurado (80, 443)
- [ ] Supabase self-hosted rodando
- [ ] Migrations executadas sem erro
- [ ] Super admin criado
- [ ] `.env.production` configurado com chaves reais
- [ ] CRM buildado e rodando via Docker
- [ ] Nginx configurado como proxy reverso
- [ ] SSL ativo via Certbot
- [ ] DNS apontando para o servidor
- [ ] Testar login em `https://crm.seudominio.com.br/auth`
- [ ] Redis com senha configurada

---

## Comandos Uteis (dia a dia)

```bash
# ── Logs ──
docker compose -f ~/crm-maya/docker-compose.prod.yml logs -f app
docker compose -f ~/supabase/docker/docker-compose.yml logs -f supabase-db

# ── Restart ──
docker compose -f ~/crm-maya/docker-compose.prod.yml restart app

# ── Rebuild apos git pull ──
cd ~/crm-maya
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# ── Backup do banco ──
docker exec -t supabase-db pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql

# ── Restaurar backup ──
cat backup_20260328.sql | docker exec -i supabase-db psql -U postgres postgres

# ── Acessar PostgreSQL diretamente ──
docker exec -it supabase-db psql -U postgres

# ── Ver uso de recursos ──
docker stats

# ── Renovar SSL ──
certbot renew
```

---

## Troubleshooting

### "Connection refused" no CRM
```bash
# Verificar se o container esta rodando
docker compose -f ~/crm-maya/docker-compose.prod.yml ps
# Ver os logs
docker compose -f ~/crm-maya/docker-compose.prod.yml logs app | tail -50
```

### Migrations falhando
```bash
# Verificar se o PostgreSQL esta acessivel
docker exec -it supabase-db psql -U postgres -c "SELECT 1"
# Rodar migration especifica com verbose
PGPASSWORD=SUA_SENHA psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/migrations/ARQUIVO.sql
```

### Redis nao conecta
```bash
# Verificar se o Redis esta rodando
docker exec -it crm-maya-redis-1 redis-cli -a SUA_SENHA_REDIS ping
# Deve retornar: PONG
```

### Supabase Auth nao funciona
```bash
# Verificar se o GoTrue esta rodando
curl http://localhost:9999/health
# Verificar logs
docker compose -f ~/supabase/docker/docker-compose.yml logs supabase-auth
```

### Workers/Cron nao executam
```bash
# Verificar nos logs do app se os workers iniciaram
docker compose -f ~/crm-maya/docker-compose.prod.yml logs app | grep -i "worker\|queue\|bull"
# Os workers so iniciam se REDIS_URL estiver configurado
```
