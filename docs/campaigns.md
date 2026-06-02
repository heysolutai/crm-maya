# Campanhas (disparo em massa) — backend

Backend completo do disparo em massa. UI (lista + wizard + detalhe) eh proxima fase.

## Deploy

1. **Migration SQL** — rodar no Postgres antes do build:
   ```bash
   cd /var/www/crm-maya
   psql "$DATABASE_URL" -f prisma/migrations/add_campaigns.sql
   ```
   Cria 2 tabelas (`campaigns`, `campaign_recipients`) + 2 colunas em `clients` (`opted_out`, `opted_out_at`) + indices e triggers de `updated_at`.

2. **Build do Prisma client** + Next:
   ```bash
   pnpm install
   pnpm prisma generate
   pnpm build
   pm2 restart crm-wyar
   ```

3. **Confirmar worker subiu**: nos logs do PM2 deve aparecer
   ```
   [Queue] Campaign tick worker iniciado
   ```

## Modelo

- **Campaign**: definicao do disparo (mensagem + audiencia + rate limit + janela + agente).
- **CampaignRecipient**: matriz cliente x campanha. Cada destinatario tem status proprio (`pending`/`sending`/`sent`/`failed`/`skipped`).
- **Client.optedOut**: setado quando cliente responde STOP/SAIR/CANCELAR/PARAR/DESCADASTRAR/REMOVE/REMOVER. Campanhas pulam quem ta opted-out.

## Worker

`startCampaignTickWorker` (concorrencia 4 — ate 4 campanhas em paralelo, cada uma com jobId proprio `campaign:<id>` evita duplicar tick).

Logica de cada tick:
1. Promove `scheduled -> running` se chegou hora
2. Pula se nao esta `running`
3. Checa janela horaria (timezone-aware via Intl.DateTimeFormat). Fora? Reagenda pra abertura
4. Checa limite diario. Batido? Reagenda pra amanha
5. Pega proximo recipient `pending`
6. Checa opt-out (client.optedOut ou phone match) — se sim, marca `skipped` e segue (sem delay)
7. Envia via adapter (texto via adapter.sendText, midia via POST /send/media direto)
8. Marca `sent`/`failed`, atualiza contadores na campanha
9. Re-enfileira proximo tick com delay aleatorio entre `minDelaySeconds` e `maxDelaySeconds`

## APIs

### Campanha
- `POST /api/campaigns` — cria draft. Body: `{ name, whatsappInstanceId, messageType, messageText, audience: { source, ...config }, ...rateLimit, ...window }`
- `GET /api/campaigns?status=&page=&limit=` — lista paginada
- `GET /api/campaigns/[id]` — detalhe com agente
- `PUT /api/campaigns/[id]` — edita draft/scheduled/paused. Bloqueado em running/completed/cancelled
- `DELETE /api/campaigns/[id]` — exclui (precisa nao estar running)

### Audiencia (3 fontes)
```js
// manual (CSV ou colar)
{ source: 'manual', phones: ['5511999...'], names?: { '5511999...': 'Joao' } }

// por tag
{ source: 'tags', tags: ['vip', 'lead-quente'], matchMode: 'any' | 'all' }

// individual (selecao na pagina de clientes)
{ source: 'individual', clientIds: ['uuid1', 'uuid2'] }
```

- `POST /api/campaigns/[id]/recipients` — materializa audiencia em `campaign_recipients`. Idempotente (skipDuplicates por unique `(campaign_id, phone)`).
- `GET /api/campaigns/[id]/recipients?status=&page=&limit=` — lista destinatarios
- `POST /api/campaigns/[id]/upload-csv` — multipart com campo `file`. Parser aceita 1-2 colunas (phone, name), virgula ou ponto-e-virgula, com/sem header. Atualiza `audienceConfig` pra `manual` mas NAO popula recipients — chame `/recipients` depois.

### Controle
- `POST /api/campaigns/[id]/send` — inicia (ou agenda se `scheduledFor` no futuro)
- `POST /api/campaigns/[id]/pause` — pausa execucao
- `POST /api/campaigns/[id]/resume` — retoma de paused
- `POST /api/campaigns/[id]/cancel` — cancela e marca pending/sending como skipped

## Variaveis no template

Suporta `{{nome}}` e `{{telefone}}`. Case-insensitive, whitespace tolerado (`{{ Nome }}`).

- `{{nome}}` -> recipient.name (fallback 'cliente' se nao tem)
- `{{telefone}}` -> recipient.phone

## Variaveis de ambiente

Nenhuma nova. Reusa `REDIS_URL` (BullMQ) e `DATABASE_URL` (Prisma). Worker sobe automatico via instrumentation se Redis estiver configurado.

## Compliance

- **Rate limit** por campanha: `minDelaySeconds` / `maxDelaySeconds` (default 8-15s). Worker usa delay aleatorio entre eles pra parecer humano.
- **Janela horaria** por campanha: `windowStartHour` / `windowEndHour` em hora local de `timezone` (default `America/Sao_Paulo`). Cruza meia-noite suportado (ex: 22-6).
- **Limite diario** por campanha: `dailyLimit` (null = sem limite). Reseta na meia-noite do timezone.
- **Opt-out automatico**: webhook detecta STOP/SAIR/CANCELAR/PARAR/DESCADASTRAR/REMOVE/REMOVER e marca cliente. Worker pula sem consumir cota.

## O que falta (proxima sessao)

- UI:
  - `/app/campaigns` — lista com status, contagem, progresso
  - `/app/campaigns/new` — wizard 4 passos (info -> audiencia -> mensagem -> agendamento)
  - `/app/campaigns/[id]` — detalhe com lista de destinatarios + acoes (pause/resume/cancel)
  - Pagina de clientes: checkbox multiplo + botao "Enviar campanha" (cria draft via API com `audience.source=individual`)
- Permissions: definir quem pode criar/disparar (sugerido: `manager+`)
- Opt-out manual via UI no perfil do cliente
- Envio de teste (so manda pra 1 numero antes de disparar todos)
