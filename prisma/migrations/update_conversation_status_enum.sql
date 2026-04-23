-- Consolida o enum ConversationStatus nos 3 estados finais: active, pending, closed.
-- 'transferred' deixa de ser status (vira filtro derivado de transferred_to).
-- 'waiting' passa a se chamar 'pending'.
--
-- IDEMPOTENTE: seguro rodar em qualquer estado (fresh install, ja migrado,
-- ou estado corrompido com "ConversationStatus_old" orfao). Auto-recupera.

DO $$
DECLARE
  col_type text;
  new_has_pending boolean;
BEGIN
  -- Descobre o tipo atual da coluna conversations.status
  SELECT t.typname INTO col_type
  FROM pg_attribute a
  JOIN pg_class c ON a.attrelid = c.oid AND c.relname = 'conversations'
  JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = current_schema()
  JOIN pg_type t ON a.atttypid = t.oid
  WHERE a.attname = 'status' AND NOT a.attisdropped;

  IF col_type IS NULL THEN
    RAISE NOTICE 'conversations.status nao existe ainda, pulando (schema sera criado pelo prisma db push)';
    RETURN;
  END IF;

  -- Verifica se ja esta migrado: coluna usa "ConversationStatus" e enum tem 'pending'
  IF col_type = 'ConversationStatus' THEN
    SELECT EXISTS(
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'ConversationStatus' AND e.enumlabel = 'pending'
    ) INTO new_has_pending;

    IF new_has_pending THEN
      -- Estado limpo. So remove orfao se existir.
      IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationStatus_old') THEN
        DROP TYPE "ConversationStatus_old";
        RAISE NOTICE 'Removido ConversationStatus_old orfao';
      ELSE
        RAISE NOTICE 'Enum ja migrado, nada a fazer';
      END IF;
      RETURN;
    END IF;
  END IF;

  RAISE NOTICE 'Migrando enum ConversationStatus (tipo atual da coluna: %)', col_type;

  -- Normaliza 'transferred' -> 'active' via text (funciona em qualquer enum)
  EXECUTE 'UPDATE conversations SET status = ''active'' WHERE status::text = ''transferred''';

  -- Se existe um "ConversationStatus" que nao e usado pela coluna, drop pra recriar limpo.
  -- (A coluna usa ConversationStatus_old nesse cenario, entao nada quebra.)
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationStatus')
     AND col_type != 'ConversationStatus' THEN
    DROP TYPE "ConversationStatus";
  END IF;

  -- Se a coluna E "ConversationStatus" mas sem 'pending', precisa do rename-dance:
  -- renomeia pra nome temporario, cria o novo, migra, dropa o temporario.
  IF col_type = 'ConversationStatus' THEN
    ALTER TYPE "ConversationStatus" RENAME TO "ConversationStatus_tmp";
  END IF;

  -- Cria o enum final (ou recria se foi dropado acima)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConversationStatus') THEN
    CREATE TYPE "ConversationStatus" AS ENUM ('active', 'pending', 'closed');
  END IF;

  -- Migra a coluna pro novo tipo, mapeando valores legados
  ALTER TABLE conversations ALTER COLUMN status DROP DEFAULT;
  ALTER TABLE conversations ALTER COLUMN status TYPE "ConversationStatus"
    USING (
      CASE status::text
        WHEN 'waiting'     THEN 'pending'::"ConversationStatus"
        WHEN 'transferred' THEN 'active'::"ConversationStatus"
        ELSE status::text::"ConversationStatus"
      END
    );
  ALTER TABLE conversations ALTER COLUMN status SET DEFAULT 'active';

  -- Cleanup de qualquer enum antigo sobrando
  DROP TYPE IF EXISTS "ConversationStatus_old";
  DROP TYPE IF EXISTS "ConversationStatus_tmp";

  RAISE NOTICE 'Migracao concluida com sucesso';
END $$;
