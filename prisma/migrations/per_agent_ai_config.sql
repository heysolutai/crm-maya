-- Configuracao de IA passa a ser 1:1 com o agente (whatsapp_instance).
-- LEGADA: substituida pelo refactor em `inbox_ai_agent_rename.sql` que
-- inverteu pra M:1 (Inbox.aiAgentId). No-op quando o schema novo ja esta aplicado.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'whatsapp_instances'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'ai_configurations'
  ) THEN
    RAISE NOTICE 'Schema legado nao existe (whatsapp_instances/ai_configurations renomeados). Skip per_agent_ai_config.sql';
  ELSE
    -- 0) Sanidade: garante que channel_type/display_name existem
    EXECUTE 'ALTER TABLE whatsapp_instances
      ADD COLUMN IF NOT EXISTS channel_type   TEXT NOT NULL DEFAULT ''uazapi'',
      ADD COLUMN IF NOT EXISTS display_name   TEXT,
      ADD COLUMN IF NOT EXISTS phone_number   TEXT,
      ADD COLUMN IF NOT EXISTS channel_config JSONB DEFAULT ''{}''::jsonb';

    -- 1) Vincular AiConfigurations orfas a uma instancia da mesma empresa
    EXECUTE '
      WITH unlinked_configs AS (
        SELECT id, company_id,
               ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at) AS cfg_rank
          FROM ai_configurations
         WHERE whatsapp_instance_id IS NULL
      ),
      unlinked_instances AS (
        SELECT i.id, i.company_id,
               ROW_NUMBER() OVER (PARTITION BY i.company_id ORDER BY i.created_at) AS inst_rank
          FROM whatsapp_instances i
         WHERE NOT EXISTS (SELECT 1 FROM ai_configurations c WHERE c.whatsapp_instance_id = i.id)
      )
      UPDATE ai_configurations c
         SET whatsapp_instance_id = inst.id
        FROM unlinked_configs uc
        JOIN unlinked_instances inst
          ON inst.company_id = uc.company_id AND inst.inst_rank = uc.cfg_rank
       WHERE c.id = uc.id
    ';

    -- 2) AiConfigurations orfas remanescentes — deletar
    EXECUTE 'DELETE FROM ai_configurations WHERE whatsapp_instance_id IS NULL';

    -- 3) Cada whatsapp_instance sem AiConfiguration: criar uma (clone ou em branco)
    EXECUTE '
      INSERT INTO ai_configurations (
        id, company_id, name, prompts, behavior_settings, conditions, api_keys, variables,
        knowledge, memory_key, products_knowledge, whatsapp_instance_id, n8n_webhook_url,
        follow_up_enabled, follow_up_stages, is_active, created_at, updated_at
      )
      SELECT
        gen_random_uuid(),
        i.company_id,
        COALESCE(template.name, ''Configuracao IA''),
        COALESCE(template.prompts, ''{}''::jsonb),
        COALESCE(template.behavior_settings, ''{}''::jsonb),
        COALESCE(template.conditions, ''{}''::jsonb),
        COALESCE(template.api_keys, ''{}''::jsonb),
        COALESCE(template.variables, ''{}''::jsonb),
        template.knowledge,
        template.memory_key,
        template.products_knowledge,
        i.id,
        template.n8n_webhook_url,
        COALESCE(template.follow_up_enabled, false),
        COALESCE(template.follow_up_stages, ''[]''::jsonb),
        true,
        NOW(),
        NOW()
      FROM whatsapp_instances i
      LEFT JOIN LATERAL (
        SELECT * FROM ai_configurations c
         WHERE c.company_id = i.company_id
         ORDER BY c.created_at ASC LIMIT 1
      ) AS template ON true
      WHERE NOT EXISTS (SELECT 1 FROM ai_configurations c WHERE c.whatsapp_instance_id = i.id)
    ';

    -- 4) Sanity check
    PERFORM 1;
    IF (SELECT COUNT(*) FROM ai_configurations WHERE whatsapp_instance_id IS NULL) > 0 THEN
      RAISE EXCEPTION 'Ainda existem AiConfiguration sem whatsapp_instance_id apos backfill';
    END IF;

    -- 5) Aplica unicidade + obrigatoriedade
    EXECUTE 'ALTER TABLE ai_configurations ALTER COLUMN whatsapp_instance_id SET NOT NULL';
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ai_configurations_whatsapp_instance_id_key ON ai_configurations (whatsapp_instance_id)';

    -- 6) Fortalece a FK pra ON DELETE CASCADE
    EXECUTE 'ALTER TABLE ai_configurations DROP CONSTRAINT IF EXISTS ai_configurations_whatsapp_instance_id_fkey';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'ai_configurations_whatsapp_instance_id_fkey'
         AND conrelid = 'ai_configurations'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE ai_configurations
        ADD CONSTRAINT ai_configurations_whatsapp_instance_id_fkey
        FOREIGN KEY (whatsapp_instance_id)
        REFERENCES whatsapp_instances (id)
        ON DELETE CASCADE';
    END IF;
  END IF;
END $$;
