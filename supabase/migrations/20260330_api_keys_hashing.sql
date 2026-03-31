-- Add encrypted key storage columns to api_keys table
-- key_hash: SHA-256 hash for fast verification
-- key_prefix: first 12 chars for DB lookup index
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_prefix VARCHAR(16);

-- Index for fast prefix-based lookup during authentication
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);

-- Note: Existing plain-text keys will be auto-migrated to encrypted format
-- on first use via the application layer (AES-256-GCM encryption).
-- The `key` column will store the encrypted value after migration.
-- Set prefix for existing keys to enable fast lookups during migration period
UPDATE api_keys
SET key_prefix = LEFT(key, 12)
WHERE key_prefix IS NULL
  AND key IS NOT NULL
  AND LENGTH(key) >= 12;
