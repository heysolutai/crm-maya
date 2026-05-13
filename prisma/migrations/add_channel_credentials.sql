-- Tabela de credenciais reutilizaveis por (empresa, canal).
-- Salva na 1a vez que o usuario cria agente; pre-preenche nas seguintes.
--
-- Idempotente: pode rodar varias vezes sem falhar (prisma db push pode
-- ter criado a tabela antes desse script).

BEGIN;

-- 1) Criar tabela se nao existir
CREATE TABLE IF NOT EXISTS channel_credentials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  channel_type    TEXT NOT NULL,
  server_url      TEXT NOT NULL,
  server_api_key  TEXT NOT NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 2) FK + unique idempotentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'channel_credentials_company_id_fkey'
       AND conrelid = 'channel_credentials'::regclass
  ) THEN
    ALTER TABLE channel_credentials
      ADD CONSTRAINT channel_credentials_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies (id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_channel_credentials_company_type
  ON channel_credentials (company_id, channel_type);

CREATE INDEX IF NOT EXISTS idx_channel_credentials_company
  ON channel_credentials (company_id);

-- 3) Backfill: extrai credenciais ja existentes em [whatsapp_instances|inbox].channel_config
--    Aceita ambos os nomes — a tabela foi renomeada de `whatsapp_instances` pra `inbox`.
DO $$
DECLARE
  src_table TEXT := NULL;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inbox') THEN
    src_table := 'inbox';
  ELSIF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='whatsapp_instances') THEN
    src_table := 'whatsapp_instances';
  END IF;

  IF src_table IS NULL THEN
    RAISE NOTICE 'Nem inbox nem whatsapp_instances existem — pulando backfill';
  ELSE
    EXECUTE format($f$
      WITH src AS (
        SELECT DISTINCT ON (company_id, channel_type)
          company_id, channel_type, api_url, channel_config
        FROM %I
        WHERE api_url IS NOT NULL
          AND channel_config ? 'serverApiKey'
          AND (channel_config->>'serverApiKey') <> ''
        ORDER BY company_id, channel_type, created_at ASC
      )
      INSERT INTO channel_credentials (company_id, channel_type, server_url, server_api_key)
      SELECT s.company_id, s.channel_type, s.api_url, s.channel_config->>'serverApiKey'
        FROM src s
       WHERE NOT EXISTS (
         SELECT 1 FROM channel_credentials c
          WHERE c.company_id = s.company_id AND c.channel_type = s.channel_type
       )
    $f$, src_table);
  END IF;
END $$;

COMMIT;
