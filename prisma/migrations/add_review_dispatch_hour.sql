-- Hora do disparo da cron de avaliacao, configuravel por empresa (0-23, BRT).
-- Default 9 = comportamento antigo (09:00 America/Sao_Paulo).
ALTER TABLE review_settings
  ADD COLUMN IF NOT EXISTS dispatch_hour INTEGER NOT NULL DEFAULT 9;
