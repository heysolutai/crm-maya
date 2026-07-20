/**
 * Fonte unica da config do "modo simples" do agente de IA.
 *
 * Usado pelo componente (SimpleAgentConfig) pra montar o prompt e pela API
 * (/api/ai-configurations) pra devolver as escolhas do cliente de forma legivel.
 * Sem isso, as opcoes (tom de voz, verbosidade, capacidades) viveriam duplicadas
 * entre o front e o back e sairiam do sincronismo.
 *
 * Modo simples e modo avancado compartilham o MESMO prompt (`prompt_completo`):
 * o simples GERA o prompt a partir das escolhas; o avancado edita o texto direto.
 */

export interface SimpleForm {
  aiName: string
  restaurantName: string
  tone: string
  /** Quanto a IA fala: objetivo (pouco) / equilibrado / detalhado (muito). */
  verbosity: string
  hours: string
  capabilities: string[]
  about: string
}

export const TONES = [
  { value: 'amigavel', label: 'Amigável', hint: 'Caloroso e simpático', promptText: 'Fale de forma calorosa, simpática e próxima, como um bom anfitrião recebendo o cliente.' },
  { value: 'formal', label: 'Formal', hint: 'Educado e profissional', promptText: 'Mantenha um tom educado, profissional e respeitoso o tempo todo.' },
  { value: 'descontraido', label: 'Descontraído', hint: 'Leve e divertido', promptText: 'Use um tom leve, descontraído e bem-humorado, sem perder a clareza.' },
] as const

export const VERBOSITY = [
  { value: 'objetivo', label: 'Fala pouco', hint: 'Respostas curtas e diretas', promptText: 'Seja objetivo: respostas curtas e diretas, sem rodeios.' },
  { value: 'equilibrado', label: 'Equilibrado', hint: 'Nem curto nem longo', promptText: 'Mantenha as respostas equilibradas — claras e completas, sem alongar demais.' },
  { value: 'detalhado', label: 'Fala muito', hint: 'Respostas completas e explicativas', promptText: 'Seja detalhado: explique bem, com contexto e exemplos quando ajudar.' },
] as const

export const CAPABILITIES = [
  { value: 'duvidas', label: 'Tirar dúvidas', promptText: 'Responder dúvidas gerais dos clientes sobre o restaurante.' },
  { value: 'cardapio', label: 'Informar cardápio e preços', promptText: 'Informar pratos, cardápio e preços quando o cliente perguntar.' },
  { value: 'reservas', label: 'Registrar reservas', promptText: 'Ajudar o cliente a reservar uma mesa, coletando nome, data, horário e número de pessoas, e confirmando antes de registrar.' },
  { value: 'agendar', label: 'Agendar com as ferramentas', promptText: 'Usar as ferramentas (tools) disponíveis para consultar disponibilidade, criar e confirmar reservas/agendamentos diretamente no sistema. Sempre conclua a ação pelas ferramentas — nunca invente uma confirmação.' },
  { value: 'localizacao', label: 'Informar endereço e como chegar', promptText: 'Informar o endereço, a localização e como chegar ao restaurante.' },
] as const

export const DEFAULT_SIMPLE_FORM: SimpleForm = {
  aiName: '',
  restaurantName: '',
  tone: 'amigavel',
  verbosity: 'equilibrado',
  hours: '',
  capabilities: ['duvidas', 'cardapio', 'reservas', 'agendar'],
  about: '',
}

/** Monta o prompt_completo a partir das escolhas do modo simples. */
export function buildPromptCompleto(s: SimpleForm): string {
  const tone = TONES.find((t) => t.value === s.tone)?.promptText || ''
  const verb = VERBOSITY.find((v) => v.value === s.verbosity)?.promptText || ''
  const style = [tone, verb].filter(Boolean).join(' ')
  const caps = CAPABILITIES.filter((c) => s.capabilities.includes(c.value))
    .map((c) => `- ${c.promptText}`)
    .join('\n')

  const nome = s.aiName.trim() || 'o atendente virtual'
  const rest = s.restaurantName.trim()

  return [
    `Você é ${nome}, atendente virtual${rest ? ` do restaurante ${rest}` : ''}. Atenda os clientes pelo WhatsApp.`,
    style && `\n## TOM DE VOZ E ESTILO\n${style}`,
    s.hours.trim() && `\n## HORÁRIO DE FUNCIONAMENTO\n${s.hours.trim()}`,
    caps && `\n## O QUE VOCÊ PODE FAZER\n${caps}`,
    s.about.trim() && `\n## SOBRE O RESTAURANTE\n${s.about.trim()}`,
    `\n## REGRAS GERAIS\n- Sempre cordial, claro e objetivo, em português do Brasil.\n- Para reservas, confirme data, horário e número de pessoas antes de registrar.\n- Quando precisar agendar, reservar ou consultar disponibilidade, use SEMPRE as ferramentas (tools) disponíveis — nunca invente confirmações ou horários.\n- Se não souber responder, ofereça encaminhar para um atendente humano.`,
  ]
    .filter(Boolean)
    .join('\n')
}

export interface AgentChoices {
  ai_name: string | null
  restaurant_name: string | null
  tone: string | null
  tone_label: string | null
  verbosity: string | null
  verbosity_label: string | null
  hours: string | null
  about: string | null
  capabilities: Array<{ value: string; label: string }>
}

/**
 * Extrai as escolhas do cliente (com rotulos legiveis) a partir do JSON de
 * prompts. Retorna null se a config nunca passou pelo modo simples.
 */
export function extractChoices(prompts: unknown): AgentChoices | null {
  const simple = (prompts as { simple?: Partial<SimpleForm> } | null)?.simple
  if (!simple || typeof simple !== 'object') return null

  const toneMeta = TONES.find((t) => t.value === simple.tone)
  const verbMeta = VERBOSITY.find((v) => v.value === simple.verbosity)

  return {
    ai_name: simple.aiName ?? null,
    restaurant_name: simple.restaurantName ?? null,
    tone: simple.tone ?? null,
    tone_label: toneMeta?.label ?? null,
    verbosity: simple.verbosity ?? null,
    verbosity_label: verbMeta?.label ?? null,
    hours: simple.hours ?? null,
    about: simple.about ?? null,
    capabilities: (simple.capabilities ?? []).map((c) => ({
      value: c,
      label: CAPABILITIES.find((cap) => cap.value === c)?.label ?? c,
    })),
  }
}
