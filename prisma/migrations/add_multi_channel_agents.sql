-- Suporte a multiplos agentes/canais por empresa.
-- LEGADA: substituida pelo rename em `inbox_ai_agent_rename.sql`.
-- No-op quando a tabela `whatsapp_instances` ja foi renomeada para `inbox`.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'whatsapp_instances'
  ) THEN
    RAISE NOTICE 'whatsapp_instances nao existe — schema ja migrado. Skip add_multi_channel_agents.sql';
  ELSE
    -- 1) Remover trava de unicidade (Prisma cria como UNIQUE INDEX)
    EXECUTE 'DROP INDEX IF EXISTS whatsapp_instances_company_id_key';
    EXECUTE 'ALTER TABLE whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_company_id_key';

    -- 2) Novas colunas
    EXECUTE 'ALTER TABLE whatsapp_instances
      ADD COLUMN IF NOT EXISTS channel_type    TEXT NOT NULL DEFAULT ''uazapi'',
      ADD COLUMN IF NOT EXISTS display_name    TEXT,
      ADD COLUMN IF NOT EXISTS phone_number    TEXT,
      ADD COLUMN IF NOT EXISTS channel_config  JSONB DEFAULT ''{}''::jsonb';

    -- 3) Backfill: registros antigos sao todos UazAPI; usa instance_name como display_name
    EXECUTE 'UPDATE whatsapp_instances
        SET display_name = COALESCE(display_name, instance_name)
      WHERE display_name IS NULL';

    -- 4) Backfill: extrair phone_number do metadata quando disponivel
    EXECUTE 'UPDATE whatsapp_instances
        SET phone_number = COALESCE(
            phone_number,
            NULLIF(metadata->>''connected_phone'', ''''),
            regexp_replace(COALESCE(metadata->''instance''->>''phone'', metadata->''instance''->>''me'', metadata->''instance''->>''owner'', metadata->''status''->>''jid'', ''''), ''[^0-9]'', '''', ''g'')
        )
      WHERE phone_number IS NULL';

    -- 5) Indice por canal
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_channel ON whatsapp_instances (channel_type)';
  END IF;
END $$;
