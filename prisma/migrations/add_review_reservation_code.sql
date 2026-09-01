-- Codigo da reserva no sistema externo (ex: F2IE8J9F do Reserve Maya),
-- informado pelo fluxo do n8n. Aplicada pelo db push no boot.
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reservation_code TEXT;
