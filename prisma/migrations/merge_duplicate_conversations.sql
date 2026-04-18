-- Consolida conversas duplicadas em todo o banco.
-- Pra cada cliente com 2+ conversas nao-fechadas, mantem a mais recente
-- (ultima updated_at) e move mensagens/notas/lembretes/etc das antigas pra ela.
-- Depois deleta as duplicadas.
--
-- Isso e pre-requisito pra criar o UNIQUE INDEX parcial que impede novas duplicatas.
-- Execute UMA VEZ antes de add_unique_conversation_index.sql.

DO $$
DECLARE
  r RECORD;
  keeper UUID;
  others UUID[];
  merged_count INT := 0;
  clients_affected INT := 0;
BEGIN
  FOR r IN
    SELECT company_id, client_id, channel,
           array_agg(id ORDER BY updated_at DESC) AS ids
    FROM conversations
    WHERE status != 'closed'
    GROUP BY company_id, client_id, channel
    HAVING COUNT(*) > 1
  LOOP
    keeper := r.ids[1];
    others := r.ids[2:array_length(r.ids, 1)];

    UPDATE messages           SET conversation_id = keeper WHERE conversation_id = ANY(others);
    UPDATE conversation_notes SET conversation_id = keeper WHERE conversation_id = ANY(others);
    UPDATE reminders          SET conversation_id = keeper WHERE conversation_id = ANY(others);
    UPDATE follow_up_jobs     SET conversation_id = keeper WHERE conversation_id = ANY(others);
    UPDATE ai_token_usage     SET conversation_id = keeper WHERE conversation_id = ANY(others);

    DELETE FROM conversations WHERE id = ANY(others);
    UPDATE conversations SET updated_at = NOW() WHERE id = keeper;

    merged_count := merged_count + array_length(others, 1);
    clients_affected := clients_affected + 1;
    RAISE NOTICE 'client %/% (canal %): manteve %, mergeou % duplicadas',
      r.company_id, r.client_id, r.channel, keeper, array_length(others, 1);
  END LOOP;

  RAISE NOTICE '=== Merge concluido: % clientes afetados, % conversas removidas ===',
    clients_affected, merged_count;
END $$;
