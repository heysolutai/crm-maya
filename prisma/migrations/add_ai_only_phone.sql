-- "IA ligada so para um numero" (teste): com o telefone preenchido, a IA do
-- WhatsApp responde so esse cliente. NULL = para todos.
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS only_phone TEXT;
