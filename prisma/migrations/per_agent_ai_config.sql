-- Configuracao de IA passa a ser 1:1 com o agente (whatsapp_instance).
--
-- Regra nova: cada agente TEM EXATAMENTE UMA AiConfiguration.
-- Antes: era per-empresa (1 ou N por empresa, sem vinculo com a instancia).
--
-- Estrategia de backfill:
--   1. Cada whatsapp_instance que NAO tem AiConfiguration vinculada ganha uma nova,
--      clonada da primeira AiConfiguration da mesma empresa (se existir).
--   2. AiConfigurations que ja tem whatsapp_instance_id ficam como estao.
--   3. AiConfigurations sem whatsapp_instance_id (orfas): vinculadas a primeira
--      whatsapp_instance disponivel da mesma empresa. Se a empresa nao tem instancia,
--      a config e DELETADA (sem instancia o agente nao existe).
--   4. Se uma empresa tem N instancias e M configs (M > 1, raro), a primeira config
--      e vinculada a primeira instancia; configs extras sao deletadas e cada
--      instancia restante recebe um clone.

BEGIN;

-- 0) Sanidade: garante que channel_type/display_name existem (idempotente)
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_type   TEXT NOT NULL DEFAULT 'uazapi',
  ADD COLUMN IF NOT EXISTS display_name   TEXT,
  ADD COLUMN IF NOT EXISTS phone_number   TEXT,
  ADD COLUMN IF NOT EXISTS channel_config JSONB DEFAULT '{}'::jsonb;

-- 1) Vincular AiConfigurations orfas (whatsapp_instance_id NULL) a uma instancia
--    da mesma empresa, escolhendo a mais antiga ainda nao vinculada.
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
   WHERE NOT EXISTS (
     SELECT 1 FROM ai_configurations c
      WHERE c.whatsapp_instance_id = i.id
   )
)
UPDATE ai_configurations c
   SET whatsapp_instance_id = inst.id
  FROM unlinked_configs uc
  JOIN unlinked_instances inst
    ON inst.company_id = uc.company_id
   AND inst.inst_rank  = uc.cfg_rank
 WHERE c.id = uc.id;

-- 2) AiConfigurations que sobraram orfas (empresa sem instancia disponivel) — deletar
DELETE FROM ai_configurations WHERE whatsapp_instance_id IS NULL;

-- 3) Para cada whatsapp_instance que ainda nao tem AiConfiguration: clonar da primeira
--    config da empresa (se houver) ou criar config em branco
INSERT INTO ai_configurations (
  id, company_id, name, prompts, behavior_settings, conditions, api_keys, variables,
  knowledge, memory_key, products_knowledge, whatsapp_instance_id, n8n_webhook_url,
  follow_up_enabled, follow_up_stages, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  i.company_id,
  COALESCE(template.name, 'Configuracao IA') AS name,
  COALESCE(template.prompts, '{}'::jsonb),
  COALESCE(template.behavior_settings, '{}'::jsonb),
  COALESCE(template.conditions, '{}'::jsonb),
  COALESCE(template.api_keys, '{}'::jsonb),
  COALESCE(template.variables, '{}'::jsonb),
  template.knowledge,
  template.memory_key,
  template.products_knowledge,
  i.id AS whatsapp_instance_id,
  template.n8n_webhook_url,
  COALESCE(template.follow_up_enabled, false),
  COALESCE(template.follow_up_stages, '[]'::jsonb),
  true AS is_active,
  NOW(),
  NOW()
  FROM whatsapp_instances i
  LEFT JOIN LATERAL (
    SELECT * FROM ai_configurations c
     WHERE c.company_id = i.company_id
     ORDER BY c.created_at ASC
     LIMIT 1
  ) AS template ON true
 WHERE NOT EXISTS (
   SELECT 1 FROM ai_configurations c
    WHERE c.whatsapp_instance_id = i.id
 );

-- 4) Sanity check antes de virar a coluna NOT NULL: nao pode ter NULL
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM ai_configurations WHERE whatsapp_instance_id IS NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Ainda existem % AiConfiguration sem whatsapp_instance_id apos backfill', n;
  END IF;
END $$;

-- 5) Aplica unicidade + obrigatoriedade
ALTER TABLE ai_configurations
  ALTER COLUMN whatsapp_instance_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_configurations_whatsapp_instance_id_key
  ON ai_configurations (whatsapp_instance_id);

-- 6) Fortalece a FK pra ON DELETE CASCADE (deletar agente apaga a config dele)
ALTER TABLE ai_configurations
  DROP CONSTRAINT IF EXISTS ai_configurations_whatsapp_instance_id_fkey;

ALTER TABLE ai_configurations
  ADD CONSTRAINT ai_configurations_whatsapp_instance_id_fkey
  FOREIGN KEY (whatsapp_instance_id)
  REFERENCES whatsapp_instances (id)
  ON DELETE CASCADE;

COMMIT;
