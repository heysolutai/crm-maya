-- ============================================
-- Migration 010: Row Level Security (RLS) Policies
-- Enables multi-tenant isolation per company
-- ============================================

-- ========================
-- ENABLE RLS ON ALL TABLES
-- ========================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_funnel_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_distribution_state ENABLE ROW LEVEL SECURITY;

-- ========================
-- COMPANIES
-- ========================

-- Users can see their own company
CREATE POLICY "companies_select_own" ON companies
  FOR SELECT USING (id IN (SELECT company_id FROM users WHERE id = auth.uid()));

-- Super admins can see all companies
CREATE POLICY "companies_super_admin" ON companies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ========================
-- USERS
-- ========================

-- Users can see users in their company
CREATE POLICY "users_company_isolation" ON users
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    OR id = auth.uid()
  );

-- Users can update their own profile
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (id = auth.uid());

-- ========================
-- COMPANY-SCOPED TABLES (company_id based isolation)
-- ========================

-- user_roles
CREATE POLICY "user_roles_company_isolation" ON user_roles
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- role_permissions
CREATE POLICY "role_permissions_company_isolation" ON role_permissions
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- api_keys
CREATE POLICY "api_keys_company_isolation" ON api_keys
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- funnel_stages
CREATE POLICY "funnel_stages_company_isolation" ON funnel_stages
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- clients
CREATE POLICY "clients_company_isolation" ON clients
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- client_notes
CREATE POLICY "client_notes_company_isolation" ON client_notes
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- client_funnel_history
CREATE POLICY "client_funnel_history_company_isolation" ON client_funnel_history
  FOR ALL USING (
    client_id IN (
      SELECT id FROM clients WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- conversations
CREATE POLICY "conversations_company_isolation" ON conversations
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- messages (via conversation)
CREATE POLICY "messages_company_isolation" ON messages
  FOR ALL USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- message_reactions (via message -> conversation)
CREATE POLICY "message_reactions_company_isolation" ON message_reactions
  FOR ALL USING (
    message_id IN (
      SELECT m.id FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
    )
  );

-- conversation_notes
CREATE POLICY "conversation_notes_company_isolation" ON conversation_notes
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- products
CREATE POLICY "products_company_isolation" ON products
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- sales
CREATE POLICY "sales_company_isolation" ON sales
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- appointments
CREATE POLICY "appointments_company_isolation" ON appointments
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- reminders
CREATE POLICY "reminders_company_isolation" ON reminders
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- follow_up_jobs
CREATE POLICY "follow_up_jobs_company_isolation" ON follow_up_jobs
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- inboxes
CREATE POLICY "inboxes_company_isolation" ON inboxes
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- google_calendar_connections
CREATE POLICY "google_calendar_company_isolation" ON google_calendar_connections
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- ai_agents
CREATE POLICY "ai_agents_company_isolation" ON ai_agents
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- ai_token_usage
CREATE POLICY "ai_token_usage_company_isolation" ON ai_token_usage
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- company_faqs
CREATE POLICY "company_faqs_company_isolation" ON company_faqs
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- analytics_daily
CREATE POLICY "analytics_daily_company_isolation" ON analytics_daily
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- daily_reports
CREATE POLICY "daily_reports_company_isolation" ON daily_reports
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- support_tickets
CREATE POLICY "support_tickets_company_isolation" ON support_tickets
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- lead_distribution_state
CREATE POLICY "lead_dist_company_isolation" ON lead_distribution_state
  FOR ALL USING (
    company_id IN (SELECT company_id FROM users WHERE id = auth.uid())
  );

-- ========================
-- PLANS (public read)
-- ========================

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_public_read" ON plans
  FOR SELECT USING (true);

CREATE POLICY "plans_super_admin_write" ON plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

-- ========================
-- SERVICE ROLE BYPASS
-- Supabase service_role key bypasses RLS automatically
-- ========================
