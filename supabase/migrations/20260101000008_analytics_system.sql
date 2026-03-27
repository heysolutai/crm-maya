-- ============================================
-- Migration 008: Analytics, Reports & System
-- analytics_daily, daily_reports, support_tickets, lead_distribution_state
-- ============================================

-- 1. Analytics Daily
CREATE TABLE IF NOT EXISTS analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_company ON analytics_daily(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_company_date ON analytics_daily(company_id, date);

-- 2. Daily Reports
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_date TEXT NOT NULL DEFAULT CURRENT_DATE::text,
  crm_entries INTEGER DEFAULT 0,
  crm_scheduled INTEGER DEFAULT 0,
  crm_scheduled_today INTEGER DEFAULT 0,
  manual_entries INTEGER DEFAULT 0,
  manual_scheduled INTEGER DEFAULT 0,
  manual_scheduled_today INTEGER DEFAULT 0,
  manual_attended INTEGER DEFAULT 0,
  sales_ids TEXT[],
  sales_total NUMERIC DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_company ON daily_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(company_id, report_date);

-- 3. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  admin_notes TEXT,
  resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  screenshot_paths TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_company ON support_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- 4. Lead Distribution State (round-robin)
CREATE TABLE IF NOT EXISTS lead_distribution_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_assigned_user_id UUID,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT lead_distribution_state_company_id_key UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_dist_company ON lead_distribution_state(company_id);
