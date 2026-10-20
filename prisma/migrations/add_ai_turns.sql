-- Registro da IA: uma linha por mensagem do cliente tratada (enviada ao fluxo,
-- respondida, ignorada com motivo, erro). Aplicada pelo prisma db push no boot.
CREATE TABLE IF NOT EXISTS ai_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_ids TEXT[] NOT NULL DEFAULT '{}',
  texto TEXT,
  status TEXT NOT NULL,
  motivo TEXT,
  destino TEXT,
  ai_status TEXT,
  pausado_ate TIMESTAMP(3),
  resposta TEXT,
  respondido_em TIMESTAMP(3),
  latency_ms INTEGER,
  bloqueios INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_turns_conversation ON ai_turns (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_turns_company ON ai_turns (company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_turns_company_status ON ai_turns (company_id, status, created_at);
