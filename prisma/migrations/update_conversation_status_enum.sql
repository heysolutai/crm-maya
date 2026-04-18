-- Consolida o enum ConversationStatus nos 3 estados finais: active, pending, closed.
-- 'transferred' deixa de ser status (vira filtro derivado de transferred_to).
-- 'waiting' passa a se chamar 'pending'.

-- 1) Converter conversas transferidas para ativas (transferred_to segue preenchido)
UPDATE conversations SET status = 'active' WHERE status = 'transferred';

-- 2) Renomear waiting -> pending no enum (Postgres permite rename in-place)
ALTER TYPE "ConversationStatus" RENAME VALUE 'waiting' TO 'pending';

-- 3) Recriar enum sem 'transferred' (Postgres nao suporta DROP VALUE)
ALTER TYPE "ConversationStatus" RENAME TO "ConversationStatus_old";

CREATE TYPE "ConversationStatus" AS ENUM ('active', 'pending', 'closed');

ALTER TABLE conversations
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE "ConversationStatus"
  USING status::text::"ConversationStatus",
  ALTER COLUMN status SET DEFAULT 'active';

DROP TYPE "ConversationStatus_old";
