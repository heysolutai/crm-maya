# CRM Maya - Database Migrations

## Ordem de Execução

As migrations devem ser executadas na ordem dos timestamps:

### Setup Inicial (VPS Nova)
```
20260101000000_extensions_enums.sql     → Extensões e Enum types
20260101000001_core_tables.sql          → plans, companies, users, user_roles, role_permissions, api_keys
20260101000002_clients.sql              → funnel_stages, clients, client_notes, client_funnel_history
20260101000003_conversations_messages.sql → conversations, messages, message_reactions, conversation_notes
20260101000004_sales_products.sql       → products, sales
20260101000005_appointments_scheduling.sql → appointments, reminders, follow_up_jobs
20260101000006_integrations.sql         → whatsapp_instances, google_calendar_connections + FKs
20260101000007_ai_knowledge.sql         → ai_configurations, ai_token_usage, company_faqs
20260101000008_analytics_system.sql     → analytics_daily, daily_reports, support_tickets, lead_distribution_state
20260101000009_views_functions.sql      → Views (team_member_profiles, v_active_conversations, v_company_metrics) + Functions
20260101000010_rls_policies.sql         → Row Level Security para todas as tabelas
20260101000011_triggers.sql             → Triggers (updated_at, auto-create user profile)
20260101000012_pgcron_pgnet.sql         → pg_cron + pg_net (reminders, follow-ups, whatsapp status)
```

### Migrations Incrementais
```
20260325_departments_pipelines.sql           → Departments, pipelines, pipeline_stages + data migration
20260326_department_roundrobin_presence.sql   → is_online em users, department_id em lead_distribution
```

## Como Executar

### Opção 1: Supabase CLI
```bash
supabase db reset  # Reseta e aplica todas as migrations
```

### Opção 2: Manual via psql
```bash
# Conectar ao banco Supabase
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# Executar cada arquivo na ordem
\i 20260101000000_extensions_enums.sql
\i 20260101000001_core_tables.sql
# ... etc
```

### Opção 3: Script automático
```bash
chmod +x run_migrations.sh
./run_migrations.sh "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
```

## Tabelas Dinâmicas (know_* / memory_*)

As tabelas `know_[empresa]` e `memory_[empresa]` são criadas dinamicamente pela aplicação quando uma nova empresa é configurada. Elas NÃO fazem parte das migrations base.

## Notas Importantes

- Todas as tabelas usam `company_id` para isolamento multi-tenant
- RLS (Row Level Security) está habilitado em TODAS as tabelas
- O `service_role` key do Supabase bypassa RLS automaticamente
- Triggers de `updated_at` são aplicados automaticamente
- O trigger `handle_new_user` cria o perfil público quando um usuário se registra via Supabase Auth

## pg_cron + pg_net (Jobs Agendados)

Após rodar todas as migrations, configure os valores do seu ambiente:

```sql
-- 1. Salvar a anon key no Vault do Supabase
SELECT vault.create_secret('SUA_ANON_KEY_AQUI', 'supabase_anon_key');

-- 2. Configurar o job do WhatsApp status check manualmente
SELECT cron.schedule(
  'whatsapp-status-check',
  '*/5 * * * *',
  $$SELECT net.http_post(
    url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/whatsapp-status-cron',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer SUA_ANON_KEY"}'::jsonb,
    body := concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;$$
);

-- 3. Verificar jobs configurados
SELECT jobid, jobname, schedule, command FROM cron.job ORDER BY jobid;
```

### Jobs Ativos

| Job | Schedule | Descrição |
|-----|----------|-----------|
| `process-follow-ups` | `* * * * *` | Despacha follow-ups pendentes → Edge Function `process-follow-up` |
| `process-reminders` | `* * * * *` | Despacha lembretes pendentes → Edge Function `process-reminder` |
| `whatsapp-status-check` | `*/5 * * * *` | Verifica status das instâncias WhatsApp → Edge Function `whatsapp-status-cron` |
