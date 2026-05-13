-- Liga cada conversa ao agente que a recebeu (whatsapp_instances.id).
-- LEGADA: substituida pelo rename em `inbox_ai_agent_rename.sql`.
--
-- Esta migration roda APENAS se o schema ainda esta no formato antigo
-- (tabela `whatsapp_instances` existe). No schema novo (apos rename para
-- `inbox`), ela e no-op pra nao quebrar deploys que reroda todas as
-- migrations.

DO $$
BEGIN
  -- Se a tabela legada nao existe, schema ja foi migrado — skip silencioso
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'whatsapp_instances'
  ) THEN
    RAISE NOTICE 'whatsapp_instances nao existe — schema ja migrado para inbox. Skip add_agent_id_to_conversations.sql';
  ELSE
    -- 1) Coluna nova (nullable porque conversas antigas podem nao ter origem clara)
    EXECUTE 'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID';

    -- 2) Indice pro filtro "conversas deste agente"
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_instance ON conversations (whatsapp_instance_id)';

    -- 3) Foreign key — ON DELETE SET NULL pra nao perder a conversa se o agente for removido
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'conversations_whatsapp_instance_id_fkey'
         AND conrelid = 'conversations'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE conversations
        ADD CONSTRAINT conversations_whatsapp_instance_id_fkey
        FOREIGN KEY (whatsapp_instance_id)
        REFERENCES whatsapp_instances (id)
        ON DELETE SET NULL';
    END IF;

    -- 4) Backfill: empresas com apenas 1 instancia ativa
    EXECUTE '
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
         AND c.whatsapp_instance_id IS NULL
    ';
  END IF;
END $$;
