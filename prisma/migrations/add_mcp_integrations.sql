-- Integracoes por servidor MCP: o tipo de conexao da integracao e o JSON
-- Schema dos argumentos de cada ferramenta (como o servidor mandou).
-- Registro: o schema e aplicado no boot pelo `prisma db push`.

ALTER TABLE integrations ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'http';
ALTER TABLE integration_tools ADD COLUMN IF NOT EXISTS input_schema JSONB;

-- Modo de ferramentas por WhatsApp (function_calls | mcp) e conexao MCP
-- privada de um restaurante/agente (null = catalogo do super-admin).
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS tool_mode TEXT NOT NULL DEFAULT 'function_calls';
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE integrations ADD COLUMN IF NOT EXISTS ai_agent_id UUID;
