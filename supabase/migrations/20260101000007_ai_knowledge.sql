-- ============================================
-- Migration 007: AI & Knowledge Base
-- ai_configurations, ai_token_usage, company_faqs
-- ============================================

-- 1. AI Configurations
CREATE TABLE IF NOT EXISTS ai_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  prompts JSONB,
  behavior_settings JSONB,
  conditions JSONB,
  api_keys JSONB,
  variables JSONB,
  knowledge TEXT,
  memory_key TEXT,
  whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  n8n_webhook_url TEXT,
  follow_up_enabled BOOLEAN DEFAULT false,
  follow_up_stages JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_config_company ON ai_configurations(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_config_active ON ai_configurations(company_id, is_active);

-- 2. AI Token Usage
CREATE TABLE IF NOT EXISTS ai_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_type TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  input_cost NUMERIC DEFAULT 0,
  output_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_token_company ON ai_token_usage(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_conversation ON ai_token_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_token_created ON ai_token_usage(company_id, created_at DESC);

-- 3. Company FAQs
CREATE TABLE IF NOT EXISTS company_faqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT,
  keywords TEXT[],
  order_position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_faqs_company ON company_faqs(company_id);
CREATE INDEX IF NOT EXISTS idx_company_faqs_category ON company_faqs(company_id, category);
