-- Garante deduplicação atômica de mensagens vindas da UAZapi.
-- Postgres permite múltiplos NULLs em UNIQUE, então mensagens antigas sem
-- uazMessageId continuam válidas. O índice antigo idx_messages_uaz é removido
-- pois o unique index cobre a mesma função de lookup.

-- 1) Limpar duplicatas existentes (mantém a primeira criada, remove as demais)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY uaz_message_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM messages
  WHERE uaz_message_id IS NOT NULL
)
DELETE FROM messages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Remover índice não-unique antigo (se existir)
DROP INDEX IF EXISTS "idx_messages_uaz";

-- 3) Criar índice UNIQUE (NULLs permitidos por padrão no Postgres)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_messages_uaz_message_id"
  ON "messages" ("uaz_message_id");
