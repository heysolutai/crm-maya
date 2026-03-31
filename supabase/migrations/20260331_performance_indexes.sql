-- Composite indexes for high-volume message processing
-- These speed up the most frequent query patterns under load

-- Messages: pagination by conversation (ORDER BY createdAt DESC)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conv_created
  ON messages (conversation_id, created_at DESC);

-- Conversations: list by company filtered by status (dashboard, sidebar)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_status
  ON conversations (company_id, status);

-- Conversations: find active conversation for a client (webhook processing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_client_status
  ON conversations (client_id, status);
