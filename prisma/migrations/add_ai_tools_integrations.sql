-- Ferramentas da IA: catalogo de integracoes (super-admin), ativacao por
-- restaurante e log de chamadas. Aplicada pelo prisma db push no boot.

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  segment TEXT,
  icon TEXT,
  base_url TEXT NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}',
  config_fields JSONB NOT NULL DEFAULT '[]',
  test_tool_name TEXT,
  test_args JSONB,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integration_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  ai_description TEXT NOT NULL,
  prompt_hint TEXT,
  parameters JSONB NOT NULL DEFAULT '[]',
  method TEXT NOT NULL DEFAULT 'POST',
  path TEXT NOT NULL DEFAULT '',
  body_template JSONB,
  response_template TEXT,
  post_actions JSONB NOT NULL DEFAULT '[]',
  is_write BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_integration_tools_integration ON integration_tools (integration_id);

CREATE TABLE IF NOT EXISTS company_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}',
  enabled_tools TEXT[] NOT NULL DEFAULT '{}',
  last_test_at TIMESTAMP(3),
  last_test_ok BOOLEAN,
  last_error TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_integrations_unique ON company_integrations (company_id, integration_id);

CREATE TABLE IF NOT EXISTS ai_tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  source TEXT NOT NULL,
  integration_id UUID,
  run_id TEXT,
  arguments JSONB NOT NULL DEFAULT '{}',
  result TEXT,
  ok BOOLEAN NOT NULL,
  error TEXT,
  http_status INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_conversation ON ai_tool_calls (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_company_tool ON ai_tool_calls (company_id, tool_name, created_at);
