-- Pausa da IA com prazo + linha do tempo de eventos da conversa.
-- Aplicada automaticamente pelo prisma db push no boot do container.

-- Pausa com prazo: null em ai_paused_until com ai_paused=true = sem prazo.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ai_paused_until TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS ai_paused_at TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS ai_paused_by TEXT;

-- Eventos (so insere): base das contagens de encaminhamento no dashboard.
CREATE TABLE IF NOT EXISTS conversation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'system',
  user_id UUID,
  department_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversation_events_company_type_created
  ON conversation_events (company_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_events_conversation
  ON conversation_events (conversation_id);
