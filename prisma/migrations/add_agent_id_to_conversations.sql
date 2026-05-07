-- Liga cada conversa ao agente que a recebeu (whatsapp_instances.id).
-- Necessario pra:
--   - Mostrar a fonte da conversa na UI (qual agente recebeu)
--   - Roteamento de envio (responder pelo agente certo)
--   - Filtrar conversas por agente
--
-- Backfill: pra empresas que tem so 1 instancia, vincula todas as conversas
-- existentes a ela. Empresas com multiplas instancias deixam null (so as
-- novas conversas vao ter o link); o usuario pode ajustar manualmente depois.

BEGIN;

-- 1) Coluna nova (nullable porque conversas antigas podem nao ter origem clara)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID;

-- 2) Indice pro filtro "conversas deste agente"
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_instance
  ON conversations (whatsapp_instance_id);

-- 3) Foreign key — ON DELETE SET NULL pra nao perder a conversa se o agente for removido.
--    Postgres nao tem ADD CONSTRAINT IF NOT EXISTS — usamos DO block pra ficar idempotente
--    (prisma db push tambem cria essa FK, entao se rodar prisma + sql, a 2a falharia sem isso).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'conversations_whatsapp_instance_id_fkey'
       AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_whatsapp_instance_id_fkey
      FOREIGN KEY (whatsapp_instance_id)
      REFERENCES whatsapp_instances (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 4) Backfill: empresas com apenas 1 instancia ativa.
--    Postgres nao tem MIN(uuid) — fazemos JOIN com a tabela direto pra
--    pegar o id da unica instancia de cada empresa.
WITH single_instance_companies AS (
  SELECT company_id
    FROM whatsapp_instances
   WHERE is_active = true
   GROUP BY company_id
  HAVING COUNT(*) = 1
)
UPDATE conversations c
   SET whatsapp_instance_id = wi.id
  FROM whatsapp_instances wi
  JOIN single_instance_companies s ON s.company_id = wi.company_id
 WHERE c.company_id = wi.company_id
   AND wi.is_active = true
   AND c.whatsapp_instance_id IS NULL;

COMMIT;
