-- Inbox (conexao de WhatsApp) escolhida pro disparo de avaliacao.
-- Null = todas as inboxes ativas com restaurant_id (comportamento padrao).
-- Aplicada automaticamente pelo prisma db push no boot do container.
ALTER TABLE review_settings
  ADD COLUMN IF NOT EXISTS inbox_id UUID;
