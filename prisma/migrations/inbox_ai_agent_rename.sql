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
-- Renomeia FKs em tabelas dependentes:
--   conversations.whatsapp_instance_id  -> inbox_id
--   reminders.whatsapp_instance_id      -> inbox_id
--   follow_up_jobs.whatsapp_instance_id -> inbox_id
--   (catalog_products.instance_id ja eh inbox_id no conceito - so renomear no app)
--
-- Reversibilidade: snapshot do DB antes; se algo der errado, restaura.
-- ==========================================================================

BEGIN;

-- 1) Adiciona inboxes.ai_agent_id (ainda apontando pra ai_configurations)
ALTER TABLE whatsapp_instances
  ADD COLUMN ai_agent_id UUID;

-- 2) Backfill: usa o vinculo 1:1 atual pra popular o novo lado
UPDATE whatsapp_instances wi
SET ai_agent_id = ac.id
FROM ai_configurations ac
WHERE ac.whatsapp_instance_id = wi.id;

-- 3) Dropa FK + UNIQUE da relacao antiga ANTES de renomear/dropar colunas
ALTER TABLE ai_configurations
  DROP CONSTRAINT IF EXISTS ai_configurations_whatsapp_instance_id_fkey;
ALTER TABLE ai_configurations
  DROP CONSTRAINT IF EXISTS ai_configurations_whatsapp_instance_id_key;
DROP INDEX IF EXISTS ai_configurations_whatsapp_instance_id_key;

-- 4) Dropa a coluna da relacao antiga
ALTER TABLE ai_configurations
  DROP COLUMN whatsapp_instance_id;

-- 5) Renomeia coluna nas tabelas que apontam pra whatsapp_instances
ALTER TABLE conversations
  RENAME COLUMN whatsapp_instance_id TO inbox_id;
ALTER TABLE reminders
  RENAME COLUMN whatsapp_instance_id TO inbox_id;
ALTER TABLE follow_up_jobs
  RENAME COLUMN whatsapp_instance_id TO inbox_id;

-- 6) Renomeia indices das colunas renomeadas
ALTER INDEX IF EXISTS idx_conversations_whatsapp_instance
  RENAME TO idx_conversations_inbox;

-- 7) Renomeia as tabelas principais
ALTER TABLE whatsapp_instances RENAME TO inboxes;
ALTER TABLE ai_configurations  RENAME TO ai_agents;

-- 8) Renomeia indices das tabelas renomeadas
ALTER INDEX IF EXISTS idx_whatsapp_instances_company
  RENAME TO idx_inboxes_company;
ALTER INDEX IF EXISTS idx_whatsapp_instances_channel
  RENAME TO idx_inboxes_channel;
ALTER INDEX IF EXISTS idx_ai_config_company
  RENAME TO idx_ai_agents_company;
ALTER INDEX IF EXISTS idx_ai_config_active
  RENAME TO idx_ai_agents_active;

-- 9) Cria FK e indice de inboxes.ai_agent_id -> ai_agents(id)
ALTER TABLE inboxes
  ADD CONSTRAINT inboxes_ai_agent_id_fkey
  FOREIGN KEY (ai_agent_id) REFERENCES ai_agents(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inboxes_ai_agent
  ON inboxes(ai_agent_id);

-- 10) Renomeia trigger triggers de updated_at (se existirem com nomes velhos)
-- (Os triggers sao criados via DO block em supabase/migrations/20260101000011_triggers.sql)
-- O ALTER TABLE RENAME ja propaga pros triggers internos.

-- 11) Renomeia RLS policies (Postgres mantem a policy apos RENAME TABLE,
--     mas o nome dela ainda referencia o nome velho da tabela. Renomeamos
--     pra consistencia em ferramentas de inspecao.)
ALTER POLICY IF EXISTS "whatsapp_instances_company_isolation" ON inboxes
  RENAME TO "inboxes_company_isolation";
ALTER POLICY IF EXISTS "ai_configurations_company_isolation" ON ai_agents
  RENAME TO "ai_agents_company_isolation";

-- 12) Recria a funcao delete_company_cascade com os nomes novos
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

COMMIT;
