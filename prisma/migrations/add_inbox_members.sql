-- M:M entre Inbox e User — define atendentes que fazem parte de cada inbox.
-- Usado pra:
--   1. Visibilidade: atendente so ve conversas das inboxes que ele faz parte
--   2. Round-robin: quando IA transfere, escolhe proximo membro da inbox
--
-- Idempotente.

BEGIN;

CREATE TABLE IF NOT EXISTS inbox_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inbox_id   UUID NOT NULL,
  user_id    UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- FKs com cascade — se remove inbox ou user, remove a membership
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'inbox_members_inbox_id_fkey'
       AND conrelid = 'inbox_members'::regclass
  ) THEN
    ALTER TABLE inbox_members
      ADD CONSTRAINT inbox_members_inbox_id_fkey
      FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'inbox_members_user_id_fkey'
       AND conrelid = 'inbox_members'::regclass
  ) THEN
    ALTER TABLE inbox_members
      ADD CONSTRAINT inbox_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Unique pra impedir duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS inbox_members_inbox_id_user_id_key
  ON inbox_members (inbox_id, user_id);

CREATE INDEX IF NOT EXISTS idx_inbox_members_inbox ON inbox_members (inbox_id);
CREATE INDEX IF NOT EXISTS idx_inbox_members_user  ON inbox_members (user_id);

-- Round-robin por inbox: adiciona coluna inbox_id em lead_distribution_state
ALTER TABLE lead_distribution_state
  ADD COLUMN IF NOT EXISTS inbox_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'lead_distribution_state_inbox_id_fkey'
       AND conrelid = 'lead_distribution_state'::regclass
  ) THEN
    ALTER TABLE lead_distribution_state
      ADD CONSTRAINT lead_distribution_state_inbox_id_fkey
      FOREIGN KEY (inbox_id) REFERENCES inboxes(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lead_dist_inbox ON lead_distribution_state (inbox_id);

COMMIT;
