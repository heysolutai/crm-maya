-- Add ad tracking fields to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ad_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ad_headline TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ad_body TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ad_media_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ad_source_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ad_platform TEXT;

-- Indexes for ad analytics queries
CREATE INDEX IF NOT EXISTS idx_clients_utm_source ON clients (utm_source);
CREATE INDEX IF NOT EXISTS idx_clients_ad_id ON clients (ad_id);
