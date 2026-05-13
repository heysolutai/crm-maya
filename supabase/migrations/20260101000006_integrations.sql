-- ============================================
-- Migration 006: Integrations
-- inboxes (antes whatsapp_instances), google_calendar_connections
-- + FK updates for reminders/follow_up_jobs
-- ============================================

-- 1. Inboxes (canais de comunicacao — WhatsApp/Instagram/etc)
CREATE TABLE IF NOT EXISTS inboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  display_name TEXT,
  phone_number TEXT,
  channel_type TEXT NOT NULL DEFAULT 'uazapi',
  channel_config JSONB DEFAULT '{}'::jsonb,
  api_url TEXT,
  instance_api_key TEXT,
  admin_token TEXT,
  status TEXT DEFAULT 'disconnected',
  is_active BOOLEAN DEFAULT true,
  qr_code TEXT,
  error_message TEXT,
  last_connected_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  ai_agent_id UUID,  -- FK added in migration 007 after ai_agents table is created
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inboxes_company ON inboxes(company_id);
CREATE INDEX IF NOT EXISTS idx_inboxes_channel ON inboxes(channel_type);

-- 2. Google Calendar Connections
CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL,
  calendar_name TEXT NOT NULL,
  connected_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  sync_enabled BOOLEAN DEFAULT true,
  create_meet_links BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT google_calendar_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_company ON google_calendar_connections(company_id);

-- 3. Renomeia colunas FK em reminders/follow_up_jobs (antes whatsapp_instance_id)
-- Em fresh installs, essas colunas foram criadas como inbox_id em 005.
-- Aqui so adicionamos as constraints.
ALTER TABLE reminders
  ADD CONSTRAINT reminders_inbox_id_fkey
  FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE SET NULL;

ALTER TABLE follow_up_jobs
  ADD CONSTRAINT follow_up_jobs_inbox_id_fkey
  FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE SET NULL;
