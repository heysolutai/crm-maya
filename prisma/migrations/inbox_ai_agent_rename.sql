-- ==========================================================================
-- REFACTOR: Inbox vs AiAgent (decouple do antigo WhatsappInstance/AiConfiguration)
-- ==========================================================================
--
-- Rebatiza:
--   whatsapp_instances  -> inboxes
--   ai_configurations   -> ai_agents
--
-- Inverte a relacao (1:1 -> M:1):
--   Antes: ai_configurations.whatsapp_instance_id (UNIQUE FK)
--   Depois: inboxes.ai_agent_id (FK nullable, ON DELETE SET NULL)
--
-- Idempotente: detecta 3 cenarios e age sob demanda:
--   A) DB antigo (tem whatsapp_instances) → faz rename + reestrutura FKs
--   B) DB ja migrado (tem inboxes)        → garante FKs + funcao delete_cascade
--   C) DB novo via prisma db push          → idem (B) — schema ja esta certo
--
-- A funcao delete_company_cascade sempre e recriada (idempotente via OR REPLACE).
-- ==========================================================================

DO $$
DECLARE
  has_legacy_tables BOOLEAN;
  has_new_tables BOOLEAN;
BEGIN
  has_legacy_tables := EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'whatsapp_instances'
  );
  has_new_tables := EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'inboxes'
  );

  IF has_legacy_tables AND NOT has_new_tables THEN
    -- CENARIO A: DB antigo — executar todo o rename
    RAISE NOTICE 'Schema legado detectado — aplicando rename completo';

    -- 1) Adiciona inboxes.ai_agent_id (ainda apontando pra ai_configurations)
    EXECUTE 'ALTER TABLE whatsapp_instances ADD COLUMN IF NOT EXISTS ai_agent_id UUID';

    -- 2) Backfill: usa o vinculo 1:1 atual pra popular o novo lado
    EXECUTE '
      UPDATE whatsapp_instances wi
         SET ai_agent_id = ac.id
        FROM ai_configurations ac
       WHERE ac.whatsapp_instance_id = wi.id
    ';

    -- 3) Dropa FK + UNIQUE da relacao antiga
    EXECUTE 'ALTER TABLE ai_configurations DROP CONSTRAINT IF EXISTS ai_configurations_whatsapp_instance_id_fkey';
    EXECUTE 'ALTER TABLE ai_configurations DROP CONSTRAINT IF EXISTS ai_configurations_whatsapp_instance_id_key';
    EXECUTE 'DROP INDEX IF EXISTS ai_configurations_whatsapp_instance_id_key';

    -- 4) Dropa a coluna da relacao antiga (se ainda existir)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='ai_configurations' AND column_name='whatsapp_instance_id'
    ) THEN
      EXECUTE 'ALTER TABLE ai_configurations DROP COLUMN whatsapp_instance_id';
    END IF;

    -- 5) Renomeia coluna nas tabelas que apontam pra whatsapp_instances
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='conversations' AND column_name='whatsapp_instance_id') THEN
      EXECUTE 'ALTER TABLE conversations RENAME COLUMN whatsapp_instance_id TO inbox_id';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reminders' AND column_name='whatsapp_instance_id') THEN
      EXECUTE 'ALTER TABLE reminders RENAME COLUMN whatsapp_instance_id TO inbox_id';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='follow_up_jobs' AND column_name='whatsapp_instance_id') THEN
      EXECUTE 'ALTER TABLE follow_up_jobs RENAME COLUMN whatsapp_instance_id TO inbox_id';
    END IF;

    -- 6) Renomeia indices das colunas renomeadas
    EXECUTE 'ALTER INDEX IF EXISTS idx_conversations_whatsapp_instance RENAME TO idx_conversations_inbox';

    -- 7) Renomeia as tabelas principais
    EXECUTE 'ALTER TABLE whatsapp_instances RENAME TO inboxes';
    EXECUTE 'ALTER TABLE ai_configurations  RENAME TO ai_agents';

    -- 8) Renomeia indices das tabelas renomeadas
    EXECUTE 'ALTER INDEX IF EXISTS idx_whatsapp_instances_company RENAME TO idx_inboxes_company';
    EXECUTE 'ALTER INDEX IF EXISTS idx_whatsapp_instances_channel RENAME TO idx_inboxes_channel';
    EXECUTE 'ALTER INDEX IF EXISTS idx_ai_config_company RENAME TO idx_ai_agents_company';
    EXECUTE 'ALTER INDEX IF EXISTS idx_ai_config_active  RENAME TO idx_ai_agents_active';

    -- 11) Renomeia RLS policies (mantem consistencia em ferramentas de inspecao)
    EXECUTE 'ALTER POLICY IF EXISTS "whatsapp_instances_company_isolation" ON inboxes RENAME TO "inboxes_company_isolation"';
    EXECUTE 'ALTER POLICY IF EXISTS "ai_configurations_company_isolation" ON ai_agents RENAME TO "ai_agents_company_isolation"';

  ELSIF has_new_tables THEN
    RAISE NOTICE 'Schema novo ja aplicado (inboxes/ai_agents existem). Pulando rename.';
  ELSE
    RAISE NOTICE 'Nenhuma das tabelas (whatsapp_instances/inboxes) existe — instalacao incompleta?';
    RETURN;
  END IF;

  -- 9) FK e indice de inboxes.ai_agent_id — idempotente, vale pros 2 cenarios
  IF has_new_tables OR has_legacy_tables THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'inboxes_ai_agent_id_fkey'
         AND conrelid = 'inboxes'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE inboxes
        ADD CONSTRAINT inboxes_ai_agent_id_fkey
        FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id)
        ON DELETE SET NULL';
    END IF;

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_inboxes_ai_agent ON inboxes(ai_agent_id)';
  END IF;
END $$;

-- 12) Recria a funcao delete_company_cascade com os nomes novos
--     (CREATE OR REPLACE e idempotente — sempre roda fora do DO block)
CREATE OR REPLACE FUNCTION delete_company_cascade(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ai_token_usage WHERE company_id = p_company_id;
  DELETE FROM ai_agents WHERE company_id = p_company_id;
  DELETE FROM follow_up_jobs WHERE company_id = p_company_id;
  DELETE FROM reminders WHERE company_id = p_company_id;
  DELETE FROM conversation_notes WHERE company_id = p_company_id;
  DELETE FROM message_reactions WHERE message_id IN (
    SELECT m.id FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.company_id = p_company_id
  );
  DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE company_id = p_company_id
  );
  DELETE FROM conversations WHERE company_id = p_company_id;
  DELETE FROM appointments WHERE company_id = p_company_id;
  DELETE FROM sales WHERE company_id = p_company_id;
  DELETE FROM client_funnel_history WHERE client_id IN (
    SELECT id FROM clients WHERE company_id = p_company_id
  );
  DELETE FROM client_notes WHERE company_id = p_company_id;
  DELETE FROM clients WHERE company_id = p_company_id;
  DELETE FROM products WHERE company_id = p_company_id;
  DELETE FROM company_faqs WHERE company_id = p_company_id;
  DELETE FROM analytics_daily WHERE company_id = p_company_id;
  DELETE FROM daily_reports WHERE company_id = p_company_id;
  DELETE FROM support_tickets WHERE company_id = p_company_id;
  DELETE FROM lead_distribution_state WHERE company_id = p_company_id;
  DELETE FROM inboxes WHERE company_id = p_company_id;
  DELETE FROM google_calendar_connections WHERE company_id = p_company_id;
  DELETE FROM api_keys WHERE company_id = p_company_id;
  DELETE FROM funnel_stages WHERE company_id = p_company_id;
  DELETE FROM role_permissions WHERE company_id = p_company_id;
  DELETE FROM user_roles WHERE company_id = p_company_id;
  UPDATE users SET company_id = NULL WHERE company_id = p_company_id;
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;
