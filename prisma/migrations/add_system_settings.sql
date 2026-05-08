-- Tabela de configuracoes globais editaveis em runtime via super-admin.
-- Substitui env vars que precisam mudar sem restart (webhook URLs, chaves API).
--
-- Nome da tabela: system_config (a tabela system_settings ja existe e guarda
-- branding singleton da empresa — nao confundir).
--
-- Idempotente — pode rodar varias vezes (prisma db push tambem cria).

BEGIN;

CREATE TABLE IF NOT EXISTS system_config (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  is_secret   BOOLEAN NOT NULL DEFAULT false,
  updated_by  UUID,
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Seed inicial das chaves conhecidas (so insere se nao existir).
-- Os valores ficam vazios de proposito — o admin preenche pela UI.
-- Codigo le DB primeiro, cai pra env como fallback.
INSERT INTO system_config (key, description, is_secret) VALUES
  ('n8n_ai_webhook_url',         'URL N8N que recebe mensagens de IA (fallback global)', false),
  ('n8n_faq_upload_webhook_url', 'URL N8N pra upload de FAQ', false),
  ('knowledge_webhook_url',      'URL N8N de sincronia da base de conhecimento', false),
  ('default_openai_api_key',     'Chave OpenAI default (usada quando empresa nao tem propria)', true)
ON CONFLICT (key) DO NOTHING;

COMMIT;
