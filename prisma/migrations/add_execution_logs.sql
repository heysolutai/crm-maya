-- Logs de execucao do fluxo de IA externo (n8n / Maestro) por conversa.
-- Aplicada automaticamente pelo prisma db push no boot do container.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_thread_id TEXT;

CREATE TABLE IF NOT EXISTS execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id UUID,
  provider TEXT NOT NULL DEFAULT 'n8n',
  thread_id TEXT,
  run_id TEXT,
  execution_url TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_conversation
  ON execution_logs (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_execution_logs_company_status
  ON execution_logs (company_id, status, created_at);
