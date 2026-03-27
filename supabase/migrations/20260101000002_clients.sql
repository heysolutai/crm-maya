-- ============================================
-- Migration 002: Clients & Funnel
-- funnel_stages, clients, client_notes, client_funnel_history
-- ============================================

-- 1. Funnel Stages (legacy - will be migrated to pipeline_stages later)
CREATE TABLE IF NOT EXISTS funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  order_position INTEGER NOT NULL,
  is_default BOOLEAN DEFAULT false,
  is_final BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_funnel_stages_company ON funnel_stages(company_id);
CREATE INDEX IF NOT EXISTS idx_funnel_stages_order ON funnel_stages(company_id, order_position);

-- 2. Clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  secondary_phone TEXT,
  birth_date TEXT,
  gender TEXT,
  document_number TEXT,
  avatar_url TEXT,
  address JSONB,
  source TEXT,
  tags TEXT[],
  custom_fields JSONB,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES funnel_stages(id) ON DELETE SET NULL,
  whatsapp_lid TEXT,
  is_active BOOLEAN DEFAULT true,
  ai_paused BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_company ON clients(company_id);
CREATE INDEX IF NOT EXISTS idx_clients_assigned ON clients(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_stage ON clients(stage_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_whatsapp_lid ON clients(whatsapp_lid);

-- 3. Client Notes
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_company ON client_notes(company_id);

-- 4. Client Funnel History
CREATE TABLE IF NOT EXISTS client_funnel_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  moved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_funnel_history_client ON client_funnel_history(client_id);
CREATE INDEX IF NOT EXISTS idx_client_funnel_history_stage ON client_funnel_history(stage_id);
