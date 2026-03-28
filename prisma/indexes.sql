-- ============================================
-- Performance indexes for polling queries (3s interval)
-- Run after prisma db push
-- ============================================

-- Unread messages count (runs every 3s per user)
-- Covers: WHERE sender_type='client' AND is_read=false AND created_at >= X
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread_polling
ON messages (conversation_id, sender_type, is_read, created_at)
WHERE sender_type = 'client' AND is_read = false;

-- Conversations list (runs every 3s per user)
-- Covers: WHERE company_id=X ORDER BY updated_at DESC LIMIT 100
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_company_updated
ON conversations (company_id, updated_at DESC);

-- Sidebar counts: appointments today
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_appointments_company_scheduled
ON appointments (company_id, scheduled_for, status)
WHERE status IN ('scheduled', 'confirmed');

-- Sidebar counts: pending follow-ups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_followups_company_pending
ON follow_up_jobs (company_id, status)
WHERE status = 'pending';
