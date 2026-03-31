# QUESTIONS.md

## Objetivo deste documento
Este documento lista perguntas técnicas e arquiteturais para alinhar o que é bug vs. comportamento intencional antes de iniciar refatorações.  
Cada pergunta traz: **porquê**, **embasamento**, **risco** e **padrão recomendado**.

---

## 1) Segurança e autorização (multi-tenant)

### Q01. Existe uma política central e obrigatória de autorização por tenant (company) para todos os endpoints?
**Pergunta:** Hoje a autorização parece implementada endpoint a endpoint. Vamos formalizar uma regra única (ex.: “toda query por ID precisa validar companyId no mesmo `where`”)?

**Por que estou perguntando:** Sem política central, cada endpoint pode esquecer uma validação e abrir acesso cruzado entre empresas.

**Embasamento técnico:** Diversos endpoints fazem `await authenticate(req)` mas não usam `companyId` na query final (ex.: `src/app/api/messages/route.ts:7-18`, `src/app/api/pipeline-stages/route.ts:7-13`, `src/app/api/user-settings/route.ts:8-15`).

**Risco:** Vazamento e alteração de dados entre tenants; incidente de segurança crítico.

**Padrão correto recomendado:** Centralizar autorização por tenant em helper/middleware de domínio (ex.: `assertResourceBelongsToCompany(resourceId, authCompanyId)`) e aplicar em todos os CRUDs.

---

### Q02. O override de `companyId` via query/body é intencional para usuários não super-admin?
**Pergunta:** Usuários comuns podem enviar `companyId` diferente do `authCompanyId` em endpoints administrativos?

**Por que estou perguntando:** O padrão `companyId = query/body || authCompanyId` aparece muitas vezes sem bloqueio explícito para não super-admin.

**Embasamento técnico:** `src/app/api/whatsapp-instances/route.ts:7-9`, `src/app/api/ai-configurations/route.ts:7-9,24-27`, `src/app/api/departments/route.ts:7-9,28-31`, `src/app/api/pipelines/route.ts:7-9,30-33`, `src/app/api/conversations/route.ts:7-9,54-57`.

**Risco:** Escalada horizontal entre empresas por manipulação de query/body.

**Padrão correto recomendado:** Se `!isSuperAdmin`, ignorar override e usar sempre `authCompanyId`. Só super-admin pode escolher `companyId` arbitrário.

---

### Q03. `GET/DELETE /api/messages` deve permitir operar por `conversationId`/`id` sem validar dono da conversa?
**Pergunta:** Qualquer usuário autenticado pode listar/excluir mensagem de qualquer conversa só conhecendo IDs?

**Por que estou perguntando:** Há autenticação, mas não há validação de pertencimento ao tenant.

**Embasamento técnico:** `src/app/api/messages/route.ts:7-18` e `:34-39`.

**Risco:** Leitura e exclusão indevida de mensagens entre empresas.

**Padrão correto recomendado:** `where` com join lógico de tenant (mensagem -> conversa -> companyId = authCompanyId).

---

### Q04. `POST /api/messages/mark-read` pode marcar mensagens de qualquer conversa?
**Pergunta:** Devemos exigir que `conversationId` pertença à empresa do usuário antes do `updateMany`?

**Por que estou perguntando:** Hoje apenas recebe `conversationId` e atualiza.

**Embasamento técnico:** `src/app/api/messages/mark-read/route.ts:7-19`.

**Risco:** Alteração indevida de estado de leitura de conversas de terceiros.

**Padrão correto recomendado:** Validar conversa por `companyId` autenticado antes de `updateMany`.

---

### Q05. `GET /api/unread-messages` deve aceitar lista arbitrária de `conversationIds`?
**Pergunta:** O endpoint deve confiar em IDs passados pelo cliente sem checar company?

**Por que estou perguntando:** O endpoint agrega por lista enviada via querystring.

**Embasamento técnico:** `src/app/api/unread-messages/route.ts:8-23`.

**Risco:** Enumeração e inferência de atividade de conversas de outros tenants.

**Padrão correto recomendado:** Filtrar também por `conversation.companyId = authCompanyId`.

---

### Q06. `GET /api/message-reactions` precisa validar ownership das mensagens?
**Pergunta:** Podemos retornar reações de qualquer `messageId` informado?

**Por que estou perguntando:** Não há validação de tenant.

**Embasamento técnico:** `src/app/api/message-reactions/route.ts:8-16`.

**Risco:** Vazamento de metadados de interação entre empresas.

**Padrão correto recomendado:** Resolver `messageIds` permitidos via join com conversa da empresa autenticada.

---

### Q07. `GET /api/quoted-messages` por `uazMessageId` sem company é intencional?
**Pergunta:** Esse endpoint pode revelar mensagem citada de qualquer tenant?

**Por que estou perguntando:** Busca direta por ID externo sem escopo.

**Embasamento técnico:** `src/app/api/quoted-messages/route.ts:8-13`.

**Risco:** Exposição de conteúdo de mensagens entre empresas.

**Padrão correto recomendado:** Incluir filtro por `conversation.companyId` do usuário.

---

### Q08. `GET /api/conversations/find-by-client` por `clientId` sem scoping é esperado?
**Pergunta:** O endpoint deve localizar conversa de qualquer cliente conhecido no banco?

**Por que estou perguntando:** Filtro atual ignora tenant.

**Embasamento técnico:** `src/app/api/conversations/find-by-client/route.ts:8-13`.

**Risco:** Descoberta de IDs de conversa de outros tenants.

**Padrão correto recomendado:** `where: { clientId, companyId: authCompanyId }` ou join equivalente.

---

### Q09. `GET /api/client-history` por `clientId` sem company é comportamento desejado?
**Pergunta:** Histórico de funil pode ser lido sem validação de tenant?

**Por que estou perguntando:** Endpoint só filtra por `clientId`.

**Embasamento técnico:** `src/app/api/client-history/route.ts:8-13`.

**Risco:** Vazamento de histórico comercial de outra empresa.

**Padrão correto recomendado:** Validar `client.companyId = authCompanyId`.

---

### Q10. `GET/PATCH /api/user-settings` permite operar qualquer `userId` do sistema?
**Pergunta:** Usuário comum deve ler/alterar settings de outro usuário informando ID?

**Por que estou perguntando:** O endpoint não cruza `userId` com usuário autenticado nem com role.

**Embasamento técnico:** `src/app/api/user-settings/route.ts:8-16` e `:28-45`.

**Risco:** Alteração indevida de preferências/assinatura/permissões de outros usuários.

**Padrão correto recomendado:** Permitir apenas “self” por padrão; exceções somente para admin com checagem explícita.

---

### Q11. `POST /api/user/presence` deveria usar usuário autenticado em vez de `user_id` do body?
**Pergunta:** É intencional permitir que o cliente escolha qual usuário ficará online/offline?

**Por que estou perguntando:** O ID vem do body e é usado diretamente.

**Embasamento técnico:** `src/app/api/user/presence/route.ts:10-21,26-39`; import de auth não utilizado na lógica (`:3`).

**Risco:** Falsificação de presença, impacto operacional e social engineering interno.

**Padrão correto recomendado:** Derivar `userId` do token/sessão autenticada.

---

### Q12. `POST/PUT/DELETE /api/departments/members` deveria validar empresa e permissões?
**Pergunta:** Qualquer usuário autenticado pode editar membros de qualquer departamento por ID?

**Por que estou perguntando:** Não há validação de `department.companyId` nem role.

**Embasamento técnico:** `src/app/api/departments/members/route.ts:7-17`, `:29-39`, `:49-59`.

**Risco:** Manipulação de estrutura organizacional entre tenants.

**Padrão correto recomendado:** Validar departamento da empresa autenticada + role administrativa.

---

### Q13. `pipeline-stages` (todos verbos) deveria validar tenant por pipeline?
**Pergunta:** Podemos criar/reordenar/excluir estágio com qualquer `pipelineId`/`id`?

**Por que estou perguntando:** Atualizações e deleções são por ID simples.

**Embasamento técnico:** `src/app/api/pipeline-stages/route.ts:11-13`, `:26-34`, `:52-55`, `:79-82`, `:85`.

**Risco:** Corrupção de funil de outro tenant.

**Padrão correto recomendado:** Sempre validar `pipeline.companyId = authCompanyId`.

---

### Q14. `PUT/DELETE /api/pipelines` por `id` sem company é intencional?
**Pergunta:** Deve existir proteção para impedir edição de pipeline de outra empresa?

**Por que estou perguntando:** `update` e `soft delete` não filtram tenant.

**Embasamento técnico:** `src/app/api/pipelines/route.ts:72-80` e `:89-97`.

**Risco:** Alteração estrutural entre empresas.

**Padrão correto recomendado:** `where` condicionado a recurso pertencente à empresa autenticada.

---

### Q15. `PUT/DELETE /api/departments` por `id` sem company é esperado?
**Pergunta:** Usuário de uma empresa pode editar/deletar departamento de outra?

**Por que estou perguntando:** Atualização/deleção por ID simples.

**Embasamento técnico:** `src/app/api/departments/route.ts:49-57` e `:66-74`.

**Risco:** Violação de isolamento multi-tenant.

**Padrão correto recomendado:** Validar ownership do departamento e role.

---

### Q16. `PUT/DELETE /api/clients` por `id` sem tenant check é requisito?
**Pergunta:** A ausência de validação por company em update/delete de cliente é intencional?

**Por que estou perguntando:** Apenas autentica e opera por `id`.

**Embasamento técnico:** `src/app/api/clients/route.ts:52-61` e `:71-76`.

**Risco:** Edição/remoção de clientes de terceiros.

**Padrão correto recomendado:** `where` com validação de `companyId` do recurso.

---

### Q17. A API legacy `/api/faqs` é para manter em produção?
**Pergunta:** Devemos manter duas APIs de FAQ com níveis de segurança diferentes?

**Por que estou perguntando:** A versão legacy usa apenas sessão/autenticação básica e aceita IDs livres.

**Embasamento técnico:** `src/app/api/faqs/route.ts:7-15`, `:27`, `:33-36`, `:63`, `:76`.

**Risco:** Superfície duplicada com comportamento de autorização divergente.

**Padrão correto recomendado:** Consolidar em uma única API com política de auth consistente.

---

### Q18. `team` e `company-team` devem continuar coexistindo?
**Pergunta:** Qual endpoint é canônico para gestão de equipe?

**Por que estou perguntando:** Ambos alteram role/status por payload sem guardas fortes de tenant.

**Embasamento técnico:** `src/app/api/team/route.ts:42-61`; `src/app/api/company-team/route.ts:58-77`.

**Risco:** Duplicidade funcional, drift e segurança inconsistente.

**Padrão correto recomendado:** Endpoint único com regras de autorização centralizadas.

---

### Q19. `GET/PUT /api/role-permissions` deve aceitar `companyId` arbitrário?
**Pergunta:** Usuário autenticado qualquer pode ler/editar permissões de outro tenant?

**Por que estou perguntando:** Falta validação de super-admin/ownership.

**Embasamento técnico:** `src/app/api/role-permissions/route.ts:7-13` e `:23-34`.

**Risco:** Escalada indireta de permissões.

**Padrão correto recomendado:** Apenas admin da própria empresa ou super-admin.

---

### Q20. `GET /api/company-details` pode listar empresa e usuários de qualquer `companyId`?
**Pergunta:** Esse endpoint deveria ser restrito?

**Por que estou perguntando:** Só exige autenticação e recebe companyId livre.

**Embasamento técnico:** `src/app/api/company-details/route.ts:7-15`.

**Risco:** Exposição de cadastro de usuários de outras empresas.

**Padrão correto recomendado:** Escopo por `authCompanyId`, com exceção super-admin explícita.

---

### Q21. `GET ?id=` e `PUT /api/companies` são super-admin only?
**Pergunta:** O comportamento atual permite acesso amplo de empresa por ID. Isso é esperado?

**Por que estou perguntando:** No `GET ?id=` não há check de super-admin; no `PUT` também não.

**Embasamento técnico:** `src/app/api/companies/route.ts:10-14` e `:50-56`.

**Risco:** Vazamento e alteração de dados mestres.

**Padrão correto recomendado:** Restringir leitura/edição global de empresas a super-admin.

---

### Q22. `PUT /api/google-calendar-connections` por `id` sem tenant é intencional?
**Pergunta:** Devemos permitir alterar conexão de calendário por ID sem conferir empresa?

**Por que estou perguntando:** `update` direto por `id`.

**Embasamento técnico:** `src/app/api/google-calendar-connections/route.ts:23-29`.

**Risco:** Quebra de integração e comprometimento de credenciais de outra empresa.

**Padrão correto recomendado:** Validar ownership da conexão antes de atualizar.

---

### Q23. `POST /api/daily-report/metric-actions` deve mutar entidades por IDs sem ownership check?
**Pergunta:** Ações como `deleteAppointment`/`updateClientSource` deveriam validar tenant do recurso antes da mutação?

**Por que estou perguntando:** Mutações críticas por ID simples.

**Embasamento técnico:** `src/app/api/daily-report/metric-actions/route.ts:15-25`, `:47-51`.

**Risco:** Alterações destrutivas cross-tenant.

**Padrão correto recomendado:** Validar company de cada entidade antes de update/delete.

---

### Q24. `POST /api/reports/daily` pode gerar relatório para `company_id` arbitrário?
**Pergunta:** Devemos exigir que `company_id` do body corresponda ao tenant autenticado?

**Por que estou perguntando:** O body controla empresa de processamento.

**Embasamento técnico:** `src/app/api/reports/daily/route.ts:14-35`, `:98-109`.

**Risco:** Leitura e envio de métricas/relatórios de outra empresa.

**Padrão correto recomendado:** Bloquear mismatch para não super-admin.

---

### Q25. Existe política de RBAC por ação (não só por autenticação)?
**Pergunta:** Endpoints de escrita sensíveis devem exigir papéis específicos (`company_admin`, `manager`)?

**Por que estou perguntando:** Grande parte dos endpoints valida só “usuário autenticado”.

**Embasamento técnico:** Padrão recorrente `await authenticate(req)` sem checks de role em rotas de administração.

**Risco:** Usuários com papel baixo executando ações administrativas.

**Padrão correto recomendado:** Matriz RBAC por endpoint + validação central.

---

## 2) Segredos e dados sensíveis

### Q26. `GET /api/whatsapp-instances` deve retornar credenciais da instância?
**Pergunta:** É necessário expor `instanceApiKey`/`adminToken` para o frontend?

**Por que estou perguntando:** Resposta retorna registro completo.

**Embasamento técnico:** `src/app/api/whatsapp-instances/route.ts:16-21`; schema com `instanceApiKey`/`adminToken` em `prisma/schema.prisma:633-635`.

**Risco:** Vazamento de credenciais da integração WhatsApp.

**Padrão correto recomendado:** DTO de saída sem segredos (mask/redact).

---

### Q27. `GET /api/ai-configurations` deve expor `apiKeys`?
**Pergunta:** É necessário devolver keys de provedores de IA ao cliente?

**Por que estou perguntando:** Config retorna objeto completo.

**Embasamento técnico:** `src/app/api/ai-configurations/route.ts:11-17`; campo `apiKeys` no schema `prisma/schema.prisma:684`.

**Risco:** Exfiltração de chaves OpenAI/Anthropic/terceiros.

**Padrão correto recomendado:** Nunca retornar segredos em leitura de configuração.

---

### Q28. `GET /api/google-calendar-connections` precisa retornar `accessToken`/`refreshToken`?
**Pergunta:** Frontend precisa desses tokens crus?

**Por que estou perguntando:** Busca sem `select`, retorna colunas sensíveis.

**Embasamento técnico:** `src/app/api/google-calendar-connections/route.ts:11-15`; campos no schema `prisma/schema.prisma:659-661`.

**Risco:** Comprometimento total da integração Google Calendar.

**Padrão correto recomendado:** Expor apenas metadados não sensíveis (email, status, calendarId mascarado).

---

### Q29. `GET /api/api-keys` deve retornar o valor da chave (`key`) em texto puro?
**Pergunta:** A UI precisa visualizar a chave inteira depois da criação?

**Por que estou perguntando:** Busca retorna registros completos de chave.

**Embasamento técnico:** `src/app/api/api-keys/route.ts:11-15`; `ApiKey.key` em `prisma/schema.prisma:230`.

**Risco:** Vazamento irreversível de chave de API.

**Padrão correto recomendado:** Mostrar apenas hash/fingerprint e último uso.

---

### Q30. Qual estratégia oficial de armazenamento de segredos no banco?
**Pergunta:** Segredos sensíveis devem ficar em plaintext no Postgres?

**Por que estou perguntando:** Múltiplas tabelas com tokens/chaves persistidos sem evidência de criptografia de aplicação.

**Embasamento técnico:** `prisma/schema.prisma:230`, `:633-634`, `:659-660`, `:684`.

**Risco:** Vazamento massivo em incidente de banco/backup/log.

**Padrão correto recomendado:** Criptografia de campo (envelope/KMS), rotação e minimização.

---

### Q31. Enviar `api_key` para webhook externo (N8N) é realmente necessário?
**Pergunta:** O payload externo precisa carregar segredo interno da empresa?

**Por que estou perguntando:** O webhook inclui chave ativa da empresa.

**Embasamento técnico:** `src/app/api/webhooks/whatsapp/route.ts:710-713` e `:739`.

**Risco:** Vaza credencial para sistema externo e logs de terceiros.

**Padrão correto recomendado:** Não trafegar segredo; usar credencial de integração segregada ou token temporário.

---

### Q32. Política de logging: podemos logar payload completo de webhook com PII?
**Pergunta:** O time aceita `JSON.stringify(rawPayload, null, 2)` em produção?

**Por que estou perguntando:** Há logging detalhado com telefone, nome, conteúdo de mensagem.

**Embasamento técnico:** `src/app/api/webhooks/whatsapp/route.ts:603-613` e diversos `console.log` (`rg` mostrou dezenas de ocorrências).

**Risco:** Exposição de dados pessoais e possível não conformidade LGPD.

**Padrão correto recomendado:** Logging estruturado com redaction por padrão.

---

### Q33. Webhook WhatsApp deve exigir assinatura/HMAC?
**Pergunta:** Existe contrato de assinatura entre provedor e nossa API para evitar spoofing?

**Por que estou perguntando:** Não encontrei validação de assinatura na entrada.

**Embasamento técnico:** `src/app/api/webhooks/whatsapp/route.ts:582-612` (processa payload direto após `req.json()`; busca por `signature` não mostrou validação de entrada).

**Risco:** Injeção de eventos falsos, mensagens forjadas e automações indevidas.

**Padrão correto recomendado:** Verificar assinatura criptográfica por request + replay protection (timestamp/nonce).

---

### Q34. `/api/ai/elevenlabs-voices` deve ser público/autenticado?
**Pergunta:** Esse proxy externo pode ser chamado sem autenticação/rate-limit?

**Por que estou perguntando:** Endpoint aceita API key enviada pelo caller e consulta provedor externo.

**Embasamento técnico:** `src/app/api/ai/elevenlabs-voices/route.ts:8-19`.

**Risco:** Abuso de infraestrutura e custo por uso indevido.

**Padrão correto recomendado:** Exigir autenticação + rate limiting + validação de origem.

---

### Q35. `/api/auth/register` deve ficar aberto em produção?
**Pergunta:** Qual é o fluxo oficial de criação de usuários: convite admin ou cadastro aberto?

**Por que estou perguntando:** Endpoint cria usuários livremente sem papel inicial explícito.

**Embasamento técnico:** `src/app/api/auth/register/route.ts:5-28`.

**Risco:** Crescimento não controlado de contas, spam e custo operacional.

**Padrão correto recomendado:** Fechar cadastro público (ou proteger com convite/feature flag/captcha).

---

### Q36. `POST /api/upload` precisa de whitelist de MIME/extensão e antivírus?
**Pergunta:** Hoje aceitamos qualquer arquivo até 50MB. Isso é suficiente para o risco aceito?

**Por que estou perguntando:** Não há validação de tipo real do arquivo nem varredura.

**Embasamento técnico:** `src/app/api/upload/route.ts:25-41`.

**Risco:** Upload de conteúdo malicioso e distribuição via `/public/uploads`.

**Padrão correto recomendado:** MIME sniffing, allowlist por bucket e varredura assíncrona.

---

### Q37. O endpoint `/api/setup` precisa proteção adicional contra corrida (race condition)?
**Pergunta:** Se duas requisições paralelas acontecerem no primeiro bootstrap, como evitamos estado inconsistente?

**Por que estou perguntando:** `count` + `create` sem transação de isolamento.

**Embasamento técnico:** `src/app/api/setup/route.ts:20-27` e `:48-63`.

**Risco:** Criação duplicada/parcial de usuários/roles iniciais.

**Padrão correto recomendado:** Transação serializable ou lock explícito de bootstrap.

---

### Q38. A política de expiração de API key está definida e consistente em todos os fluxos?
**Pergunta:** Chaves expiradas devem ser bloqueadas em toda autenticação?

**Por que estou perguntando:** Algumas rotas checam `expiresAt`, outras não.

**Embasamento técnico:** sem check em `src/lib/api/auth.ts:32-35` e `src/lib/api/appointments-helpers.ts:71-74`; com check em `src/app/api/knowledge/faq/route.ts:22` e `src/app/api/knowledge/faq/[id]/route.ts:21`.

**Risco:** Chave expirada continuar válida em parte do sistema.

**Padrão correto recomendado:** Único helper de API key auth com check de `isActive` + `expiresAt`.

---

## 3) Contratos de API e consistência funcional

### Q39. Devemos manter duas APIs de FAQ (`/api/faqs` e `/api/knowledge/faq`)?
**Pergunta:** Qual delas é canônica para CRUD e integração externa?

**Por que estou perguntando:** Hoje coexistem com contratos diferentes (sessão vs x-api-key).

**Embasamento técnico:** `src/app/api/faqs/route.ts` vs `src/app/api/knowledge/faq/route.ts`.

**Risco:** Inconsistência de dados, regras e segurança.

**Padrão correto recomendado:** Unificar e deprecar endpoint legado.

---

### Q40. Devemos manter `team` e `company-team` simultaneamente?
**Pergunta:** Qual rota a UI deve usar como fonte única?

**Por que estou perguntando:** Duas implementações paralelas de mesma responsabilidade.

**Embasamento técnico:** `src/app/api/team/route.ts` e `src/app/api/company-team/route.ts`.

**Risco:** Drift de comportamento e bugs intermitentes.

**Padrão correto recomendado:** Consolidar endpoint de equipe + contrato único.

---

### Q41. Devemos manter `company/settings` e `company-settings` simultaneamente?
**Pergunta:** Existe motivo de negócio para dois endpoints de settings de empresa?

**Por que estou perguntando:** Regras de autorização e payload diferem entre os dois.

**Embasamento técnico:** `src/app/api/company/settings/route.ts` e `src/app/api/company-settings/route.ts`.

**Risco:** Atualização via endpoint “mais permissivo” por engano.

**Padrão correto recomendado:** Um endpoint único com política clara de autorização.

---

### Q42. O `routeMap` do `invokeFn` está desatualizado para agendamentos?
**Pergunta:** As chaves `create-appointment`, `reschedule-appointment`, `get-available-slots` devem apontar para quais rotas reais?

**Por que estou perguntando:** Há mapeamentos para rotas inexistentes.

**Embasamento técnico:** `src/lib/api-functions.ts:23-25`; checagem no filesystem não encontrou `/api/appointments/create`, `/api/appointments/reschedule`, `/api/appointments/available-slots`.

**Risco:** Falhas silenciosas e UX quebrada em agendamentos.

**Padrão correto recomendado:** Mapear para rotas existentes (`/api/appointments`, `/api/appointments/[id]/reschedule`, `/api/appointments/slots`).

---

### Q43. `invokeFn` sempre `POST` é decisão intencional?
**Pergunta:** Como lidamos com endpoints que são `GET/PUT/DELETE`?

**Por que estou perguntando:** O helper força método único.

**Embasamento técnico:** `src/lib/api-functions.ts:86-90`.

**Risco:** Contratos HTTP inconsistentes e chamadas inválidas.

**Padrão correto recomendado:** Suporte explícito a método por função (ou clients dedicados por recurso).

---

### Q44. O módulo de agendamentos é API-key-only ou sessão web também é suportada?
**Pergunta:** O frontend web deveria usar `x-api-key` ou sessão para `/api/appointments`?

**Por que estou perguntando:** O frontend usa cookie/sessão, backend exige `x-api-key`.

**Embasamento técnico:** frontend `src/hooks/useAppointments.tsx:40-41`; backend `src/app/api/appointments/route.ts:15-18` + helper `src/lib/api/appointments-helpers.ts:67-70`.

**Risco:** Fluxos que “parecem funcionar” em dev e falham em produção.

**Padrão correto recomendado:** Definir contrato único por canal (web sessão, integração API key) e separar endpoints se necessário.

---

### Q45. A documentação de API está alinhada com a implementação atual?
**Pergunta:** Devemos corrigir docs que falam em Supabase Storage/Bearer quando endpoint usa outra autenticação?

**Por que estou perguntando:** Encontrei exemplos e textos divergentes.

**Embasamento técnico:** `src/views/pages/app/ApiDocs.tsx:57-72`, `:145`, `:159`, `:180`, `:202`.

**Risco:** Integrações externas implementadas de forma errada.

**Padrão correto recomendado:** Docs geradas a partir de contrato real (OpenAPI/typed schema).

---

### Q46. O guia de deploy (`docs/DEPLOY-VPS.md`) está oficialmente válido?
**Pergunta:** O projeto ainda depende de Supabase Auth/RLS “em todo o código”, como o documento afirma?

**Por que estou perguntando:** O código atual usa NextAuth + Prisma.

**Embasamento técnico:** `docs/DEPLOY-VPS.md:30-37`; autenticação atual em `src/lib/auth.ts:33-98`.

**Risco:** Equipes seguindo runbook incorreto em produção.

**Padrão correto recomendado:** Atualizar runbook para arquitetura real e versãoar mudanças de plataforma.

---

## 4) Arquitetura, operação e confiabilidade

### Q47. Rodar workers dentro do processo do app com múltiplas réplicas é estratégia definitiva?
**Pergunta:** Queremos que cada réplica da web também execute cron workers?

**Por que estou perguntando:** Swarm usa 2 réplicas e workers sobem no `instrumentation` da app.

**Embasamento técnico:** `src/instrumentation.ts:10-13`; `src/lib/queue/start-workers.ts:23-55`; `docker-compose.swarm.yml:41`.

**Risco:** Processamento duplicado, disputa e efeitos colaterais duplicados.

**Padrão correto recomendado:** Separar deployment de workers (web x worker) ou adotar lock/distributed singleton robusto.

---

### Q48. Existe mecanismo de “claim atômico” para evitar duplicidade nos cron workers?
**Pergunta:** Se dois workers lerem o mesmo item `pending`, como evitamos envio duplicado?

**Por que estou perguntando:** Fluxo atual busca lista e só depois marca cada item.

**Embasamento técnico:** `src/lib/queue/workers/cron-reminders.worker.ts:8-13,38-44`; `src/lib/queue/workers/cron-follow-ups.worker.ts:8-13,37-43`.

**Risco:** Mensagens duplicadas e inconsistência de status.

**Padrão correto recomendado:** Claim atômico (`UPDATE ... WHERE status='pending' ... RETURNING`) antes de processar.

---

### Q49. `prisma db push --accept-data-loss` no startup é aceitável em produção?
**Pergunta:** Queremos manter estratégia de schema push destrutivo no boot do container?

**Por que estou perguntando:** É uma operação de risco alto para ambiente produtivo.

**Embasamento técnico:** `entrypoint.sh:10-12`.

**Risco:** Perda de dados e drift não auditável de schema.

**Padrão correto recomendado:** Migrations versionadas (`prisma migrate deploy`) com rollout controlado.

---

### Q50. Dependência de função SQL `delete_company_cascade` está garantida em todos ambientes?
**Pergunta:** Como garantimos que a função exista se o deploy principal usa `db push` e não SQL migrations completas?

**Por que estou perguntando:** `DELETE /api/companies` depende dela.

**Embasamento técnico:** uso em `src/app/api/companies/route.ts:70-71`; função citada no fluxo de migrations do `docs/DEPLOY-VPS.md:215`.

**Risco:** Falha operacional em produção ao excluir empresa.

**Padrão correto recomendado:** Migrar função via pipeline oficial e validar pré-condições no boot.

---

### Q51. O fluxo OAuth Google precisa de `state` assinado + nonce?
**Pergunta:** Devemos endurecer integridade do `state` para impedir adulteração de `company_id`?

**Por que estou perguntando:** Hoje `state` é apenas base64 JSON.

**Embasamento técnico:** geração em `src/app/api/calendar/auth/route.ts:18`; parse em `src/app/api/calendar/callback/route.ts:15-18`.

**Risco:** Vinculação indevida de conta Google em tenant incorreto.

**Padrão correto recomendado:** `state` assinado (HMAC/JWT curto), nonce e expiração curta.

---

### Q52. Timezone hardcoded `-03:00` em agendamentos é política permanente?
**Pergunta:** O sistema será sempre São Paulo sem possibilidade de fuso por empresa?

**Por que estou perguntando:** Conversões manuais hardcoded aparecem em helpers e slots.

**Embasamento técnico:** `src/lib/api/appointments-helpers.ts:32-43`; `src/app/api/appointments/slots/route.ts:36-42,75-77`; `src/app/api/appointments/route.ts:108-110`.

**Risco:** Horários incorretos para outras regiões e bugs de calendário.

**Padrão correto recomendado:** Timezone por empresa (`IANA tz`) e biblioteca robusta de datas.

---

### Q53. Tabela de preços de IA hardcoded terá processo de atualização contínua?
**Pergunta:** Quem mantém os preços e com qual frequência?

**Por que estou perguntando:** Custos de providers mudam e tabela está fixa no código.

**Embasamento técnico:** `src/app/api/ai/track-usage/route.ts:6-25`.

**Risco:** Relatórios financeiros imprecisos.

**Padrão correto recomendado:** Fonte configurável/versionada de pricing (DB/config).

---

## 5) Performance e escalabilidade

### Q54. Polling a cada 3s em conversas/mensagens é solução definitiva?
**Pergunta:** Esse modelo é temporário ou final?

**Por que estou perguntando:** O hook invalida lista e busca mensagens por conversa carregada em loop.

**Embasamento técnico:** `src/hooks/useConversations.tsx:163-193`.

**Risco:** Alto volume de requests e custo de banco/rede em escala.

**Padrão correto recomendado:** Realtime por evento (WebSocket/SSE) + fallback de polling adaptativo.

---

### Q55. Badge de não lidas com `refetchInterval: 3000` é aceitável em produção?
**Pergunta:** Precisamos mesmo de polling tão agressivo para contador global?

**Por que estou perguntando:** Atualização muito frequente para dado agregado.

**Embasamento técnico:** `src/hooks/useTotalUnreadConversations.tsx:22`.

**Risco:** Carga desnecessária constante no backend.

**Padrão correto recomendado:** WebSocket/eventos + debounce/backoff.

---

### Q56. `dashboard-metrics` deve retornar datasets crus sem paginação?
**Pergunta:** O frontend realmente precisa de listas completas (`conversations`, `todayMessages`, `allClients`) em uma única chamada?

**Por que estou perguntando:** Endpoint acumula muitos `findMany` e payload grande.

**Embasamento técnico:** `src/app/api/dashboard-metrics/route.ts:39-97`.

**Risco:** Latência alta, memória e timeouts em empresas maiores.

**Padrão correto recomendado:** Pré-agregação por métrica + paginação para listas detalhadas.

---

### Q57. Em `total-unread`, métrica correta é mensagens não lidas ou conversas com não lidas?
**Pergunta:** O comentário fala em “conversas distintas”, mas SQL usa `COUNT(*)` de mensagens.

**Por que estou perguntando:** Pode haver divergência de regra de negócio.

**Embasamento técnico:** comentário `src/app/api/total-unread/route.ts:11-13`; query `:15-23`.

**Risco:** Indicadores inconsistentes na UI e decisões erradas de operação.

**Padrão correto recomendado:** Definir regra e refletir no SQL (`COUNT(DISTINCT conversation_id)` se for por conversa).

---

### Q58. O endpoint de webhook WhatsApp deve ser dividido em módulos?
**Pergunta:** A equipe prefere manter um handler monolítico (~1400 linhas) ou modularizar por responsabilidade?

**Por que estou perguntando:** Complexidade alta dificulta manutenção e testes.

**Embasamento técnico:** `src/app/api/webhooks/whatsapp/route.ts` (POST em `:582`, arquivo com fluxo extenso).

**Risco:** Regressões frequentes e custo alto de onboarding.

**Padrão correto recomendado:** Separar parse/validação, persistência, mídia, transcrição, webhooks externos e follow-up em serviços independentes.

---

### Q59. A rota `/app/preview` com 1511 linhas e muitos mocks deve ficar em build de produção?
**Pergunta:** Essa página é ferramenta interna de design ou parte do produto final?

**Por que estou perguntando:** Conteúdo massivo e mockado pode aumentar bundle/manutenção.

**Embasamento técnico:** `src/app/preview/page.tsx` (1511 linhas; mocks no topo `:32-69`).

**Risco:** Dívida técnica e custo de render/build desnecessário.

**Padrão correto recomendado:** Mover para Storybook/sandbox interno ou proteger por flag de ambiente.

---

### Q60. `GET /api/clients` com `take: 1000` sem paginação é teto oficial?
**Pergunta:** Como esse endpoint vai escalar quando tenant passar de 1000 clientes?

**Por que estou perguntando:** Limite fixo sem cursor/paginação explícita.

**Embasamento técnico:** `src/app/api/clients/route.ts:18`.

**Risco:** Resultado truncado, UX inconsistente e consultas pesadas.

**Padrão correto recomendado:** Paginação cursor-based + filtros server-side.

---

## 6) Qualidade, teste e governança técnica

### Q61. O mismatch de tipagem WhatsApp (snake_case vs camelCase) é conhecido?
**Pergunta:** A interface `WhatsAppInstance` em snake_case está correta com retorno do Prisma em camelCase?

**Por que estou perguntando:** Existe cast forçado que pode mascarar bug de runtime.

**Embasamento técnico:** tipo `src/lib/api/types.ts:41-48`; cast em `src/lib/api/database.ts:13`; uso em `src/lib/api/whatsapp.ts:27,36`.

**Risco:** `api_url`/`instance_api_key` undefined e falha de envio em produção.

**Padrão correto recomendado:** Tipos alinhados com Prisma (camelCase) + mapeamento explícito quando necessário.

---

### Q62. O comportamento de envio WhatsApp por `conversationId` sem validação de ownership é deliberado?
**Pergunta:** Em `send-text/media/audio`, por que não há validação de tenant (diferente de `send-agent`/`transcribe`)?

**Por que estou perguntando:** Há inconsistência de segurança entre rotas similares.

**Embasamento técnico:** sem check em `src/app/api/whatsapp/send-text/route.ts:22-45`, `send-media:67-79`, `send-audio:20-31`; com check em `src/app/api/whatsapp/send-agent/route.ts:33-35` e `src/app/api/messaging/transcribe/route.ts:34-37`.

**Risco:** Envio indevido para conversa de outro tenant.

**Padrão correto recomendado:** Padronizar validação de ownership em todos os envios.

---

### Q63. `getClientPhoneByConversationId` deveria receber `companyId` para validar escopo?
**Pergunta:** Função helper pode retornar telefone de conversa de outra empresa?

**Por que estou perguntando:** Busca por IDs sem escopo de tenant.

**Embasamento técnico:** `src/lib/api/database.ts:143-156`.

**Risco:** Uso indevido em fluxos de envio/mídia.

**Padrão correto recomendado:** Assinatura `getClientPhoneByConversationId(conversationId, companyId)` com validação interna.

---

### Q64. O projeto pretende elevar o rigor de TypeScript?
**Pergunta:** Vamos manter `strict: false` e `noImplicitAny: false` permanentemente?

**Por que estou perguntando:** Config atual reduz proteção contra erros.

**Embasamento técnico:** `tsconfig.json:11-15`.

**Risco:** Bugs de runtime que poderiam ser pegos em build.

**Padrão correto recomendado:** Plano incremental para `strict` (por pasta/modulo).

---

### Q65. Qual a estratégia oficial de testes automatizados?
**Pergunta:** Hoje não há testes (`unit/integration/e2e`) no repositório. Vamos introduzir?

**Por que estou perguntando:** Base grande com muitos endpoints sem rede de segurança.

**Embasamento técnico:** busca não retornou arquivos `*.test.*`/`*.spec.*`.

**Risco:** Regressões silenciosas em segurança e regra de negócio.

**Padrão correto recomendado:** Cobertura mínima para fluxos críticos (auth, tenant, webhooks, agendamentos).

---

### Q66. Devemos criar pipeline de CI com gates mínimos?
**Pergunta:** Há plano para CI com lint, type-check e testes antes de merge/deploy?

**Por que estou perguntando:** Não encontrei workflow versionado no repositório.

**Embasamento técnico:** ausência de pasta `.github/workflows` no workspace.

**Risco:** Quebra em produção por falta de validação automática.

**Padrão correto recomendado:** CI obrigatória + checks de qualidade por PR.

---

### Q67. README principal está desatualizado por decisão?
**Pergunta:** Querem manter README padrão de create-next-app ou documentar arquitetura real do CRM?

**Por que estou perguntando:** Onboarding técnico está prejudicado.

**Embasamento técnico:** `README.md:1-36`.

**Risco:** Aumento de tempo de onboarding e decisões técnicas equivocadas.

**Padrão correto recomendado:** README com visão de arquitetura, módulos, setup, variáveis e fluxos.

---

### Q68. Vamos versionar um `.env.example` oficial?
**Pergunta:** Existe arquivo canônico de variáveis obrigatórias/opcionais?

**Por que estou perguntando:** Não encontrei `.env.example` no projeto.

**Embasamento técnico:** busca por `.env*` no workspace sem resultado.

**Risco:** Ambientes inconsistentes e erros de configuração.

**Padrão correto recomendado:** `.env.example` + validação de env no startup.

---

### Q69. Precisamos padronizar logging (correlation-id, níveis, redaction)?
**Pergunta:** Hoje o projeto usa `console.log` extensivamente em produção. Há guideline formal?

**Por que estou perguntando:** Falta padrão único para observabilidade segura.

**Embasamento técnico:** ocorrências massivas em `src/app/api/webhooks/whatsapp/route.ts` e workers (`cron-*`).

**Risco:** Ruído, custo de observabilidade e vazamento de dados.

**Padrão correto recomendado:** Logger estruturado, níveis por ambiente e mascaramento automático.

---

## 7) Produto e comportamento (ambiguidade funcional)

### Q70. Qual regra oficial para “erro de negócio” vs “erro HTTP” nas APIs de agendamento?
**Pergunta:** Em agendamentos, erros retornam muitas vezes com HTTP 200 e `success:false`. Isso é intencional?

**Por que estou perguntando:** Esse padrão dificulta monitoramento e tratamento padronizado.

**Embasamento técnico:** exemplos de `apiError(..., 200)` em `src/app/api/appointments/route.ts:72,86,87,103,115,120,146,174` e similares nas rotas de agendamento.

**Risco:** Clientes interpretando erro como sucesso técnico.

**Padrão correto recomendado:** HTTP status semântico (4xx/5xx) + payload de erro consistente.

---

### Q71. O fluxo de setup inicial e cadastro público coexistindo é intencional?
**Pergunta:** Após setup inicial, ainda queremos permitir `register` aberto?

**Por que estou perguntando:** Há dois mecanismos de criação de usuário com governança diferente.

**Embasamento técnico:** setup em `src/app/api/setup/route.ts`; registro em `src/app/api/auth/register/route.ts`.

**Risco:** Modelo de segurança de identidade inconsistente.

**Padrão correto recomendado:** Definir fonte única de criação de usuários por ambiente.

---

### Q72. Como tratar usuário com múltiplos papéis/empresas na sessão NextAuth?
**Pergunta:** A sessão escolhe o primeiro papel com `companyId`. Isso representa a regra de negócio real?

**Por que estou perguntando:** Pode haver usuário multi-tenant com contexto incorreto na sessão.

**Embasamento técnico:** seleção em `src/lib/auth.ts:61-70`.

**Risco:** Permissões e escopo de empresa incorretos no runtime.

**Padrão correto recomendado:** “Contexto ativo” explícito de empresa/papel na sessão ou seleção do usuário.

---

## Resumo de prioridade sugerida
1. **Crítico (segurança):** Q01-Q24, Q26-Q38, Q62-Q63.  
2. **Alto (confiabilidade/arquitetura):** Q42-Q53, Q70-Q72.  
3. **Médio (performance/qualidade):** Q54-Q61, Q64-Q69.

