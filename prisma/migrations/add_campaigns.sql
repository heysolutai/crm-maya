-- Disparo de mensagens em massa.
--
-- 3 mudancas:
--   1. clients: campos opted_out / opted_out_at (cliente que pediu STOP)
--   2. campaigns: definicao do disparo (mensagem + audiencia + rate limit + janela)
--   3. campaign_recipients: matriz cliente x campanha, com status individual
--
-- Enums sao criados como TEXT com CHECK pra evitar lock de schema (Postgres
-- enum nao pode adicionar valores dentro de transaction). Validacao fica no
-- app (Zod) e no constraint.

-- 1. Opt-out de cliente
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS opted_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_clients_opted_out
  ON clients (company_id, opted_out);


-- 2. Campanhas
CREATE TABLE IF NOT EXISTS campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  whatsapp_instance_id  UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,

  name                  TEXT NOT NULL,
  description           TEXT,

  message_type          TEXT NOT NULL DEFAULT 'text'
                          CHECK (message_type IN ('text', 'image', 'document')),
  message_text          TEXT,
  media_url             TEXT,
  media_filename        TEXT,
  media_mime_type       TEXT,

  audience_source       TEXT NOT NULL
                          CHECK (audience_source IN ('manual', 'tags', 'individual')),
  audience_config       JSONB NOT NULL DEFAULT '{}'::jsonb,

  min_delay_seconds     INTEGER NOT NULL DEFAULT 8 CHECK (min_delay_seconds >= 1),
  max_delay_seconds     INTEGER NOT NULL DEFAULT 15 CHECK (max_delay_seconds >= 1),
  daily_limit           INTEGER CHECK (daily_limit IS NULL OR daily_limit > 0),

  window_start_hour     INTEGER CHECK (window_start_hour IS NULL OR (window_start_hour BETWEEN 0 AND 23)),
  window_end_hour       INTEGER CHECK (window_end_hour IS NULL OR (window_end_hour BETWEEN 0 AND 23)),
  timezone              TEXT DEFAULT 'America/Sao_Paulo',

  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  scheduled_for         TIMESTAMP,
  started_at            TIMESTAMP,
  completed_at          TIMESTAMP,
  error_message         TEXT,

  recipients_total      INTEGER NOT NULL DEFAULT 0,
  recipients_sent       INTEGER NOT NULL DEFAULT 0,
  recipients_failed     INTEGER NOT NULL DEFAULT 0,
  recipients_skipped    INTEGER NOT NULL DEFAULT 0,

  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_delay_range CHECK (max_delay_seconds >= min_delay_seconds)
);

CREATE INDEX IF NOT EXISTS idx_campaigns_company             ON campaigns (company_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_company_status      ON campaigns (company_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_whatsapp_instance   ON campaigns (whatsapp_instance_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status_scheduled    ON campaigns (status, scheduled_for);


-- 3. Destinatarios por campanha
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id             UUID REFERENCES clients(id) ON DELETE SET NULL,

  phone                 TEXT NOT NULL,
  name                  TEXT,

  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  sent_at               TIMESTAMP,
  error_message         TEXT,
  message_id            UUID,
  provider_message_id   TEXT,

  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_recipient_phone
  ON campaign_recipients (campaign_id, phone);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status
  ON campaign_recipients (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_client
  ON campaign_recipients (client_id);


-- Trigger pra atualizar updated_at automatico (mesmo padrao das outras tabelas).
-- Se a funcao trigger_set_timestamp() ja existir (ela existe nas outras migrations),
-- so adicionamos os triggers.
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_timestamp_campaigns ON campaigns;
CREATE TRIGGER set_timestamp_campaigns
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();

DROP TRIGGER IF EXISTS set_timestamp_campaign_recipients ON campaign_recipients;
CREATE TRIGGER set_timestamp_campaign_recipients
  BEFORE UPDATE ON campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_timestamp();
