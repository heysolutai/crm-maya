-- Garante que so existe UMA conversa aberta (status != 'closed') por
-- (company, cliente, canal). Trava aplicada no Postgres, nao so no codigo.
--
-- PRE-REQUISITO: rodar merge_duplicate_conversations.sql antes,
-- ou o CREATE vai falhar caso existam duplicatas pendentes.
--
-- CONCURRENTLY permite criar o indice sem lock de escrita na tabela.
-- Nao pode rodar dentro de transaction — execute fora de qualquer BEGIN.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_one_open_per_client
  ON conversations (company_id, client_id, channel)
  WHERE status != 'closed';
