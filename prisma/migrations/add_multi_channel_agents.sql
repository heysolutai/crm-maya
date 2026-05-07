-- Suporte a multiplos agentes/canais por empresa.
-- Antes: 1 WhatsappInstance por company (UNIQUE em company_id)
-- Depois: N instancias por company, cada uma com channel_type proprio
--
-- Canais suportados (channel_type):
--   uazapi, evolution_baileys, evolution_go, zapi, whatsapp_cloud, instagram

BEGIN;

-- 1) Remover trava de unicidade que limitava a 1 instancia por empresa.
-- Prisma cria @unique como UNIQUE INDEX (nao como CONSTRAINT), por isso
-- precisamos tentar derrubar de ambas as formas.
DROP INDEX IF EXISTS whatsapp_instances_company_id_key;
ALTER TABLE whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_company_id_key;

-- 2) Novas colunas
ALTER TABLE whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_type    TEXT NOT NULL DEFAULT 'uazapi',
  ADD COLUMN IF NOT EXISTS display_name    TEXT,
  ADD COLUMN IF NOT EXISTS phone_number    TEXT,
  ADD COLUMN IF NOT EXISTS channel_config  JSONB DEFAULT '{}'::jsonb;

-- 3) Backfill: registros antigos sao todos UazAPI; usa instance_name como display_name
UPDATE whatsapp_instances
   SET display_name = COALESCE(display_name, instance_name)
 WHERE display_name IS NULL;

-- 4) Backfill: extrair phone_number do metadata quando disponivel (UazAPI grava em varios formatos)
UPDATE whatsapp_instances
   SET phone_number = COALESCE(
       phone_number,
       NULLIF(metadata->>'connected_phone', ''),
       regexp_replace(COALESCE(metadata->'instance'->>'phone', metadata->'instance'->>'me', metadata->'instance'->>'owner', metadata->'status'->>'jid', ''), '[^0-9]', '', 'g')
   )
 WHERE phone_number IS NULL;

-- 5) Indice por canal (consultas filtrando por tipo)
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_channel ON whatsapp_instances (channel_type);

COMMIT;
