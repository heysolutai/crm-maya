-- Quem responde as mensagens do agente: n8n (fluxo externo) ou maestro (motor interno).
-- Aplicada pelo prisma db push no boot.
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'n8n';
