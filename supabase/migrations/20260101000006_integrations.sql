-- ============================================
-- Migration 006: Integrations
-- whatsapp_instances, google_calendar_connections
-- + FK updates for reminders/follow_up_jobs
-- ============================================

-- 1. WhatsApp Instances
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  api_url TEXT NOT NULL,
  instance_api_key TEXT,
  admin_token TEXT,
  status TEXT DEFAULT 'disconnected',
  is_active BOOLEAN DEFAULT true,
  qr_code TEXT,
  error_message TEXT,
  last_connected_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT whatsapp_instances_company_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_company ON whatsapp_instances(company_id);

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

-- 3. Add FK constraints for whatsapp_instance_id on reminders and follow_up_jobs
ALTER TABLE reminders
  ADD CONSTRAINT reminders_whatsapp_instance_id_fkey
  FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id) ON DELETE SET NULL;

ALTER TABLE follow_up_jobs
  ADD CONSTRAINT follow_up_jobs_whatsapp_instance_id_fkey
  FOREIGN KEY (whatsapp_instance_id) REFERENCES whatsapp_instances(id) ON DELETE SET NULL;
