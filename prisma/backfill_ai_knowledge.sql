-- Backfill memory_key, knowledge e products_knowledge nas AiConfigurations existentes.
-- Valor = prefixo + nome da empresa normalizado (lowercase, sem acento, sem espaco, so alfanumerico).
-- Ex: "2M Motos" -> memory_2mmotos / know_2mmotos / products_2mmotos
--
-- Uso:
--   psql $DATABASE_URL -f prisma/backfill_ai_knowledge.sql
--
-- Idempotente: so preenche onde esta NULL.
-- Habilita unaccent se nao existir (remove acentos).

CREATE EXTENSION IF NOT EXISTS unaccent;

UPDATE ai_configurations ac
SET
  memory_key = COALESCE(
    ac.memory_key,
    'memory_' || regexp_replace(lower(unaccent(c.name)), '[^a-z0-9]', '', 'g')
  ),
  knowledge = COALESCE(
    ac.knowledge,
    'know_' || regexp_replace(lower(unaccent(c.name)), '[^a-z0-9]', '', 'g')
  ),
  products_knowledge = COALESCE(
    ac.products_knowledge,
    'products_' || regexp_replace(lower(unaccent(c.name)), '[^a-z0-9]', '', 'g')
  )
FROM companies c
WHERE ac.company_id = c.id
  AND c.name IS NOT NULL
  AND c.name <> '';
