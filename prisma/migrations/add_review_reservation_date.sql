-- Data/hora da reserva avaliada, informada direto pelo fluxo do n8n quando a
-- reserva nao existe como registro no CRM. Aplicada pelo db push no boot.
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS reservation_date TIMESTAMP(3);
