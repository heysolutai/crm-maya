-- Prompt da resposta final ao cliente no fluxo de avaliacao (texto livre da
-- empresa). Aplicada pelo db push no boot do container.
ALTER TABLE review_settings
  ADD COLUMN IF NOT EXISTS prompt_final TEXT;
