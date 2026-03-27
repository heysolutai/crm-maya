-- ============================================
-- Migration 009: Views & Functions
-- ============================================

-- ========================
-- VIEWS
-- ========================

-- 1. Team Member Profiles (simplified user view)
CREATE OR REPLACE VIEW team_member_profiles AS
SELECT
  id,
  full_name,
  avatar_url,
  company_id,
  is_active
FROM users;

-- 2. Active Conversations View
CREATE OR REPLACE VIEW v_active_conversations AS
SELECT
  c.id,
  c.company_id,
  c.client_id,
  COALESCE(cl.full_name, cl.first_name || ' ' || COALESCE(cl.last_name, '')) AS client_name,
  cl.phone AS client_phone,
  c.channel,
  c.status,
  c.started_at,
  c.duration_seconds,
  c.ai_handled,
  (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count,
  (SELECT m.message_text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
  u.full_name AS transferred_to_name
FROM conversations c
JOIN clients cl ON cl.id = c.client_id
LEFT JOIN users u ON u.id = c.transferred_to
WHERE c.status IN ('active', 'waiting');

-- 3. Company Metrics View
CREATE OR REPLACE VIEW v_company_metrics AS
SELECT
  co.id AS company_id,
  co.name AS company_name,
  (SELECT COUNT(*) FROM clients cl WHERE cl.company_id = co.id AND cl.is_active = true) AS total_clients,
  (SELECT COUNT(*) FROM clients cl WHERE cl.company_id = co.id AND cl.created_at >= now() - interval '30 days') AS new_clients_30d,
  (SELECT COUNT(*) FROM conversations cv WHERE cv.company_id = co.id AND cv.status IN ('active', 'waiting')) AS active_conversations,
  (SELECT COUNT(*) FROM appointments ap WHERE ap.company_id = co.id AND ap.scheduled_for >= now() AND ap.status = 'scheduled') AS upcoming_appointments
FROM companies co
WHERE co.is_active = true;

-- ========================
-- FUNCTIONS
-- ========================

-- 1. Get user's company ID
CREATE OR REPLACE FUNCTION get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id FROM users WHERE id = _user_id LIMIT 1;
$$;

-- 2. Check if user has a specific role
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- 3. Create company with owner
CREATE OR REPLACE FUNCTION create_company_with_owner(
  p_company_name TEXT,
  p_company_email TEXT,
  p_owner_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  -- Create the company
  INSERT INTO companies (name, email)
  VALUES (p_company_name, p_company_email)
  RETURNING id INTO new_company_id;

  -- Assign user to company
  UPDATE users SET company_id = new_company_id WHERE id = p_owner_user_id;

  -- Assign admin role
  INSERT INTO user_roles (user_id, company_id, role)
  VALUES (p_owner_user_id, new_company_id, 'company_admin');

  -- Create default role permissions
  INSERT INTO role_permissions (company_id, role, crm_access, sales_access, conversation_access, appointments_access, can_edit_settings)
  VALUES
    (new_company_id, 'company_admin', 'full', 'full', 'full', 'full', true),
    (new_company_id, 'manager', 'full', 'full', 'full', 'full', false),
    (new_company_id, 'agent', 'own', 'own', 'own', 'own', false),
    (new_company_id, 'viewer', 'view', 'view', 'view', 'view', false);

  -- Create default funnel stages
  INSERT INTO funnel_stages (company_id, name, color, order_position, is_default, is_final)
  VALUES
    (new_company_id, 'Novo Lead', '#3b82f6', 1, true, false),
    (new_company_id, 'Qualificado', '#f59e0b', 2, false, false),
    (new_company_id, 'Proposta Enviada', '#8b5cf6', 3, false, false),
    (new_company_id, 'Negociação', '#ec4899', 4, false, false),
    (new_company_id, 'Fechado Ganho', '#10b981', 5, false, true),
    (new_company_id, 'Fechado Perdido', '#ef4444', 6, false, true);

  RETURN new_company_id;
END;
$$;

-- 4. Create company and assign admin (alternative signature)
CREATE OR REPLACE FUNCTION create_company_and_assign_admin(
  p_company_name TEXT,
  p_company_email TEXT,
  p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN create_company_with_owner(p_company_name, p_company_email, p_user_id);
END;
$$;

-- 5. Create company with defaults
CREATE OR REPLACE FUNCTION create_company_with_defaults(
  p_name TEXT,
  p_email TEXT,
  p_plan_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_company_id UUID;
BEGIN
  INSERT INTO companies (name, email, plan_id)
  VALUES (p_name, p_email, p_plan_id)
  RETURNING id INTO new_company_id;

  -- Create default funnel stages
  INSERT INTO funnel_stages (company_id, name, color, order_position, is_default, is_final)
  VALUES
    (new_company_id, 'Novo Lead', '#3b82f6', 1, true, false),
    (new_company_id, 'Qualificado', '#f59e0b', 2, false, false),
    (new_company_id, 'Proposta Enviada', '#8b5cf6', 3, false, false),
    (new_company_id, 'Negociação', '#ec4899', 4, false, false),
    (new_company_id, 'Fechado Ganho', '#10b981', 5, false, true),
    (new_company_id, 'Fechado Perdido', '#ef4444', 6, false, true);

  RETURN new_company_id;
END;
$$;

-- 6. Delete company cascade
CREATE OR REPLACE FUNCTION delete_company_cascade(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete in reverse dependency order
  DELETE FROM ai_token_usage WHERE company_id = p_company_id;
  DELETE FROM ai_configurations WHERE company_id = p_company_id;
  DELETE FROM follow_up_jobs WHERE company_id = p_company_id;
  DELETE FROM reminders WHERE company_id = p_company_id;
  DELETE FROM conversation_notes WHERE company_id = p_company_id;
  DELETE FROM message_reactions WHERE message_id IN (
    SELECT m.id FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.company_id = p_company_id
  );
  DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE company_id = p_company_id
  );
  DELETE FROM conversations WHERE company_id = p_company_id;
  DELETE FROM appointments WHERE company_id = p_company_id;
  DELETE FROM sales WHERE company_id = p_company_id;
  DELETE FROM client_funnel_history WHERE client_id IN (
    SELECT id FROM clients WHERE company_id = p_company_id
  );
  DELETE FROM client_notes WHERE company_id = p_company_id;
  DELETE FROM clients WHERE company_id = p_company_id;
  DELETE FROM products WHERE company_id = p_company_id;
  DELETE FROM company_faqs WHERE company_id = p_company_id;
  DELETE FROM analytics_daily WHERE company_id = p_company_id;
  DELETE FROM daily_reports WHERE company_id = p_company_id;
  DELETE FROM support_tickets WHERE company_id = p_company_id;
  DELETE FROM lead_distribution_state WHERE company_id = p_company_id;
  DELETE FROM whatsapp_instances WHERE company_id = p_company_id;
  DELETE FROM google_calendar_connections WHERE company_id = p_company_id;
  DELETE FROM api_keys WHERE company_id = p_company_id;
  DELETE FROM funnel_stages WHERE company_id = p_company_id;
  DELETE FROM role_permissions WHERE company_id = p_company_id;
  DELETE FROM user_roles WHERE company_id = p_company_id;
  UPDATE users SET company_id = NULL WHERE company_id = p_company_id;
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;

-- 7. Create company-level RLS policies (dynamic)
CREATE OR REPLACE FUNCTION create_company_policies(table_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format(
    'CREATE POLICY "%s_company_isolation" ON %I FOR ALL USING (company_id IN (SELECT company_id FROM users WHERE id = auth.uid()))',
    table_name, table_name
  );
END;
$$;

-- 8. Check appointment conflict
CREATE OR REPLACE FUNCTION check_appointment_conflict(
  p_company_id UUID,
  p_scheduled_for TIMESTAMPTZ,
  p_duration_minutes INTEGER,
  p_assigned_to UUID DEFAULT NULL,
  p_exclude_appointment_id UUID DEFAULT NULL
)
RETURNS TABLE(has_conflict BOOLEAN, conflicting_appointment_id UUID, conflicting_client_name TEXT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  p_end_time TIMESTAMPTZ;
BEGIN
  p_end_time := p_scheduled_for + (p_duration_minutes || ' minutes')::interval;

  RETURN QUERY
  SELECT
    true AS has_conflict,
    a.id AS conflicting_appointment_id,
    COALESCE(cl.full_name, cl.first_name) AS conflicting_client_name
  FROM appointments a
  JOIN clients cl ON cl.id = a.client_id
  WHERE a.company_id = p_company_id
    AND a.status IN ('scheduled', 'confirmed')
    AND (p_exclude_appointment_id IS NULL OR a.id != p_exclude_appointment_id)
    AND (p_assigned_to IS NULL OR a.assigned_to = p_assigned_to)
    AND a.scheduled_for < p_end_time
    AND (a.scheduled_for + (COALESCE(a.duration_minutes, 30) || ' minutes')::interval) > p_scheduled_for
  LIMIT 1;

  -- If no conflict found, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT;
  END IF;
END;
$$;

-- 9. Calculate daily metrics
CREATE OR REPLACE FUNCTION calculate_daily_metrics(p_company_id UUID, p_date TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  metrics_json JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_conversations', (SELECT COUNT(*) FROM conversations WHERE company_id = p_company_id AND created_at::date = p_date::date),
    'total_messages', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.company_id = p_company_id AND m.created_at::date = p_date::date),
    'new_clients', (SELECT COUNT(*) FROM clients WHERE company_id = p_company_id AND created_at::date = p_date::date),
    'appointments_scheduled', (SELECT COUNT(*) FROM appointments WHERE company_id = p_company_id AND created_at::date = p_date::date),
    'appointments_completed', (SELECT COUNT(*) FROM appointments WHERE company_id = p_company_id AND status = 'completed' AND updated_at::date = p_date::date),
    'sales_count', (SELECT COUNT(*) FROM sales WHERE company_id = p_company_id AND created_at::date = p_date::date),
    'sales_total', COALESCE((SELECT SUM(total_amount) FROM sales WHERE company_id = p_company_id AND created_at::date = p_date::date), 0),
    'ai_messages', (SELECT COUNT(*) FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.company_id = p_company_id AND m.sender_type = 'ai' AND m.created_at::date = p_date::date)
  ) INTO metrics_json;

  INSERT INTO analytics_daily (company_id, date, metrics)
  VALUES (p_company_id, p_date, metrics_json)
  ON CONFLICT (company_id, date) DO UPDATE SET metrics = metrics_json;
END;
$$;

-- 10. Get pending reminders count (utility function for monitoring)
-- NOTE: Reminders are processed by the BullMQ cron worker in Next.js,
-- not by pg_cron/pg_net. This function is kept for monitoring/debugging.
CREATE OR REPLACE FUNCTION get_pending_reminders_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.reminders
  WHERE status = 'pending'
    AND scheduled_for <= NOW()
    AND attempts < 3;
$$;

-- 11. Get pending follow-ups count (utility function for monitoring)
-- NOTE: Follow-ups are processed by the BullMQ cron worker in Next.js,
-- not by pg_cron/pg_net. This function is kept for monitoring/debugging.
CREATE OR REPLACE FUNCTION get_pending_follow_ups_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.follow_up_jobs
  WHERE status = 'pending'
    AND scheduled_for <= NOW()
    AND attempts < 3;
$$;

-- 12. Seed test data (for development)
CREATE OR REPLACE FUNCTION seed_test_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  test_plan_id UUID;
BEGIN
  -- Create a test plan
  INSERT INTO plans (name, price, max_clients, max_users, max_ai_conversations, billing_cycle)
  VALUES ('Plano Teste', 0, 100, 5, 1000, 'monthly')
  RETURNING id INTO test_plan_id;

  RAISE NOTICE 'Test plan created with ID: %', test_plan_id;
END;
$$;
