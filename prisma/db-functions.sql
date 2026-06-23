-- ============================================================
--  Funcoes SQL aplicadas no BOOT (entrypoint.sh) via `prisma db execute`.
--
--  O `prisma db push` cria apenas TABELAS — funcoes/triggers do Postgres
--  precisam ser aplicadas a parte. Por isso a funcao delete_company_cascade
--  sumia em ambientes novos (ex: o banco do stack Swarm) e a rota de deletar
--  empresa quebrava com "function delete_company_cascade(uuid) does not exist".
--
--  Tudo aqui DEVE ser idempotente (CREATE OR REPLACE) — roda em todo deploy.
-- ============================================================

-- Cascade delete de uma empresa (acao de super-admin). Remove os registros
-- filhos na ordem correta (respeitando FKs) e por fim a propria empresa.
CREATE OR REPLACE FUNCTION delete_company_cascade(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ai_token_usage WHERE company_id = p_company_id;
  DELETE FROM ai_agents WHERE company_id = p_company_id;
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
  DELETE FROM inboxes WHERE company_id = p_company_id;
  DELETE FROM google_calendar_connections WHERE company_id = p_company_id;
  DELETE FROM api_keys WHERE company_id = p_company_id;
  DELETE FROM funnel_stages WHERE company_id = p_company_id;
  DELETE FROM role_permissions WHERE company_id = p_company_id;
  DELETE FROM user_roles WHERE company_id = p_company_id;
  -- Tabelas do produto restaurante (sem FK, mas limpamos pra nao deixar orfaos)
  DELETE FROM reservations WHERE company_id = p_company_id;
  DELETE FROM login_logs WHERE company_id = p_company_id;
  -- Usuarios sao desvinculados (nao deletados) pra preservar historico de login
  UPDATE users SET company_id = NULL WHERE company_id = p_company_id;
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;
