/**
 * Estado de configuracao de um restaurante: contrato do GET /api/setup-checklist
 * e o checklist derivado dele.
 *
 * Fica num arquivo sem React de proposito: a rota (servidor) importa os tipos,
 * o hook `useSetupChecklist` e a tela de setup do super-admin montam o checklist
 * com a MESMA funcao. Assim o "o que falta" nunca diverge entre as telas.
 *
 * A API so devolve booleanos e contagens: nada de prompt, token ou URL. O
 * checklist precisa saber SE existe, nao O QUE e.
 */

export interface SetupInboxStatus {
  id: string;
  name: string;
  channelType: string;
  status: string | null;
  isActive: boolean;
  /** Status do provedor = conectado (connected/open). */
  connected: boolean;
  phoneNumber: string | null;
  /** ID do restaurante na Reserve Maya (Inbox.channelConfig.restaurantId). */
  restaurantId: string | null;
  /** Agente de IA dedicado da conexao (Inbox.aiAgentId). */
  aiAgentId: string | null;
}

export interface SetupAgentStatus {
  id: string;
  name: string | null;
  isActive: boolean;
  /** Tem prompt (prompt_completo, modo simples ou esquemas antigos). */
  hasPrompt: boolean;
  /** Webhook do n8n proprio. Sem ele vale o global do sistema. */
  hasOwnWebhook: boolean;
  /** Quem responde: 'maestro' (motor interno) nao precisa de webhook. */
  engine: 'n8n' | 'maestro';
  /** Chave propria de OpenAI/Anthropic/Gemini. */
  hasAiApiKey: boolean;
  followUpReady: boolean;
  /** Horario de funcionamento preenchido no modo simples. */
  hasHours: boolean;
  /** Endereco preenchido no modo simples. */
  hasAddress: boolean;
}

export interface SetupReviewStatus {
  enabled: boolean;
  dispatchHour: number;
  hasGoogleUrl: boolean;
  hasTripadvisorUrl: boolean;
  hasGreeting: boolean;
  relatorioSemanal: boolean;
}

export interface SetupStatus {
  company: {
    id: string;
    name: string;
    setupCompleted: boolean;
    hasBusinessHours: boolean;
    /** Escolha "IA Atendimento" salva no wizard (settings.setup_modes). Null = nunca escolheu. */
    atendimentoMode: boolean | null;
  };
  inboxes: SetupInboxStatus[];
  agents: SetupAgentStatus[];
  /** FAQs ativas com resposta. */
  faqCount: number;
  /** API keys do sistema ativas e nao expiradas (o n8n usa pra chamar a API). */
  activeApiKeys: number;
  /** n8n_ai_webhook_url global configurado (fallback do agente). */
  globalWebhookConfigured: boolean;
  /** default_openai_api_key global configurada (fallback da chave da IA). */
  defaultAiKeyConfigured: boolean;
  /** n8n_review_webhook_url global configurado (disparo das avaliacoes). */
  reviewWebhookConfigured: boolean;
  /** Null = restaurante ainda sem linha em review_settings. */
  review: SetupReviewStatus | null;
}

export type ChecklistStatus = 'red' | 'yellow' | 'green';

/** `integracao` = API key do restaurante e webhooks globais do sistema. */
export type ChecklistGroup = 'canal' | 'atendimento' | 'avaliacao' | 'integracao';

export interface ChecklistItem {
  id: number;
  label: string;
  status: ChecklistStatus;
  /** red = obrigatorio, yellow = recomendado. */
  category: 'red' | 'yellow';
  group: ChecklistGroup;
  /** Detalhe curto do que esta faltando (ou de onde veio o valor). */
  hint?: string;
}

export interface ChecklistModes {
  atendimento: boolean;
  avaliacao: boolean;
}

export const EMPTY_SETUP_STATUS: SetupStatus = {
  company: { id: '', name: '', setupCompleted: false, hasBusinessHours: false, atendimentoMode: null },
  inboxes: [],
  agents: [],
  faqCount: 0,
  activeApiKeys: 0,
  globalWebhookConfigured: false,
  defaultAiKeyConfigured: false,
  reviewWebhookConfigured: false,
  review: null,
};

type DraftItem = Omit<ChecklistItem, 'id' | 'status'> & { ok: boolean };

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' e ');
  return `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
}

/**
 * Agentes que efetivamente atendem: o vinculado a cada conexao ativa. Sem
 * conexao ainda, o webhook cai no primeiro agente ativo do restaurante, entao
 * e ele que conta.
 */
function servingAgents(status: SetupStatus): {
  agents: SetupAgentStatus[];
  inboxesWithoutAgent: SetupInboxStatus[];
} {
  const activeInboxes = status.inboxes.filter((i) => i.isActive);
  const byId = new Map(status.agents.map((a) => [a.id, a]));

  if (activeInboxes.length === 0) {
    const first = status.agents.find((a) => a.isActive);
    return { agents: first ? [first] : [], inboxesWithoutAgent: [] };
  }

  const agents: SetupAgentStatus[] = [];
  const inboxesWithoutAgent: SetupInboxStatus[] = [];
  for (const inbox of activeInboxes) {
    const agent = inbox.aiAgentId ? byId.get(inbox.aiAgentId) : undefined;
    if (agent && agent.isActive) {
      if (!agents.some((a) => a.id === agent.id)) agents.push(agent);
    } else {
      inboxesWithoutAgent.push(inbox);
    }
  }
  return { agents, inboxesWithoutAgent };
}

/**
 * Monta o checklist a partir do estado real do restaurante. `modes` decide
 * quais blocos entram: sem "IA Avaliacao", nada de avaliacao e cobrado.
 */
export function buildSetupChecklist(status: SetupStatus, modes: ChecklistModes): ChecklistItem[] {
  const drafts: DraftItem[] = [];
  const activeInboxes = status.inboxes.filter((i) => i.isActive);

  // ── Canal ──
  const connected = activeInboxes.filter((i) => i.connected);
  drafts.push({
    label: 'WhatsApp conectado',
    category: 'red',
    group: 'canal',
    ok: connected.length > 0,
    hint:
      activeInboxes.length === 0
        ? 'Nenhuma conexão criada'
        : connected.length > 0
          ? listNames(connected.map((i) => i.name))
          : 'Conexão criada, mas desconectada',
  });

  const semRestaurante = activeInboxes.filter((i) => !i.restaurantId);
  drafts.push({
    label: 'ID do restaurante na Reserve Maya',
    category: 'red',
    group: 'canal',
    ok: activeInboxes.length > 0 && semRestaurante.length === 0,
    hint:
      activeInboxes.length === 0
        ? 'Crie uma conexão primeiro'
        : semRestaurante.length > 0
          ? `Falta em: ${listNames(semRestaurante.map((i) => i.name))}`
          : undefined,
  });

  drafts.push({
    label: 'API key do sistema',
    category: 'red',
    group: 'integracao',
    ok: status.activeApiKeys > 0,
    hint: status.activeApiKeys > 0 ? undefined : 'Usada pelo n8n para falar com o CRM',
  });

  // ── IA Atendimento ──
  if (modes.atendimento) {
    const { agents, inboxesWithoutAgent } = servingAgents(status);

    drafts.push({
      label: 'Agente de IA vinculado',
      category: 'red',
      group: 'atendimento',
      ok: agents.length > 0 && inboxesWithoutAgent.length === 0,
      hint:
        inboxesWithoutAgent.length > 0
          ? `Sem agente ativo: ${listNames(inboxesWithoutAgent.map((i) => i.name))}`
          : agents.length === 0
            ? 'Nenhum agente ativo'
            : listNames(agents.map((a) => a.name || 'Agente sem nome')),
    });

    const semPrompt = agents.filter((a) => !a.hasPrompt);
    drafts.push({
      label: 'Prompt do agente',
      category: 'red',
      group: 'atendimento',
      ok: agents.length > 0 && semPrompt.length === 0,
      hint: semPrompt.length > 0 ? `Sem prompt: ${listNames(semPrompt.map((a) => a.name || 'Agente'))}` : undefined,
    });

    const webhookOk =
      agents.length > 0 &&
      agents.every((a) => a.engine === 'maestro' || a.hasOwnWebhook || status.globalWebhookConfigured);
    drafts.push({
      label: 'Webhook da IA (n8n)',
      category: 'red',
      group: 'atendimento',
      ok: webhookOk,
      hint: !webhookOk
        ? 'Sem webhook próprio e sem webhook global'
        : agents.every((a) => a.engine === 'maestro')
          ? 'Respondendo pelo Maestro (não precisa de webhook)'
          : agents.every((a) => a.hasOwnWebhook)
          ? 'Webhook próprio'
          : 'Usando o webhook global',
    });

    const aiKeyOk = agents.length > 0 && agents.every((a) => a.hasAiApiKey || status.defaultAiKeyConfigured);
    drafts.push({
      label: 'API key da IA',
      category: 'red',
      group: 'atendimento',
      ok: aiKeyOk,
      hint: !aiKeyOk
        ? 'Sem chave própria e sem chave padrão do sistema'
        : agents.every((a) => a.hasAiApiKey)
          ? 'Chave própria'
          : 'Usando a chave padrão do sistema',
    });

    drafts.push({
      label: status.faqCount > 0 ? `FAQ (${status.faqCount} pergunta${status.faqCount === 1 ? '' : 's'})` : 'FAQ / base de conhecimento',
      category: 'yellow',
      group: 'atendimento',
      ok: status.faqCount > 0,
      hint: status.faqCount > 0 ? undefined : 'Nenhuma pergunta com resposta',
    });

    drafts.push({
      label: 'Horário de funcionamento',
      category: 'yellow',
      group: 'atendimento',
      ok: status.company.hasBusinessHours || (agents.length > 0 && agents.every((a) => a.hasHours)),
    });

    drafts.push({
      label: 'Endereço',
      category: 'yellow',
      group: 'atendimento',
      ok: agents.length > 0 && agents.every((a) => a.hasAddress),
    });

    drafts.push({
      label: 'Follow-up',
      category: 'yellow',
      group: 'atendimento',
      ok: agents.length > 0 && agents.some((a) => a.followUpReady),
    });
  }

  // ── IA Avaliacao ──
  if (modes.avaliacao) {
    const review = status.review;

    drafts.push({
      label: 'Módulo de avaliação ativo',
      category: 'red',
      group: 'avaliacao',
      ok: !!review?.enabled,
    });

    drafts.push({
      label: 'Link do Google ou TripAdvisor',
      category: 'red',
      group: 'avaliacao',
      ok: !!review && (review.hasGoogleUrl || review.hasTripadvisorUrl),
      hint: review && (review.hasGoogleUrl || review.hasTripadvisorUrl)
        ? [review.hasGoogleUrl && 'Google', review.hasTripadvisorUrl && 'TripAdvisor'].filter(Boolean).join(' + ')
        : undefined,
    });

    drafts.push({
      label: 'Webhook de avaliações (n8n)',
      category: 'red',
      group: 'integracao',
      ok: status.reviewWebhookConfigured,
      hint: status.reviewWebhookConfigured ? undefined : 'Super Admin > Configurações do sistema',
    });

    drafts.push({
      label: 'Saudação da avaliação',
      category: 'yellow',
      group: 'avaliacao',
      ok: !!review?.hasGreeting,
    });
  }

  return drafts.map(({ ok, ...rest }, index) => ({
    ...rest,
    id: index + 1,
    status: ok ? 'green' : rest.category,
  }));
}
