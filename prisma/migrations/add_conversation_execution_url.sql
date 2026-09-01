-- URL de resume de fluxo externo (n8n) aguardando resposta do cliente.
-- Usada pelo fluxo de avaliacao: a proxima mensagem incoming da conversa e
-- desviada pra essa URL (one-shot) em vez do webhook de IA padrao.
-- execution_url_expires_at = TTL da URL; vencida, e ignorada e limpa.
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS execution_url TEXT;
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS execution_url_expires_at TIMESTAMP(3);
