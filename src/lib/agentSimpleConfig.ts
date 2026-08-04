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
  /** Funcionamento da casa. Ex: "Seg a sex 11h-15h e 18h-23h". */
  hours: string
  /** Endereco completo — a IA precisa dele pra informar como chegar. */
  address: string
  /**
   * Janela em que a IA pode oferecer e registrar reserva. Costuma ser MENOR
   * que o horario de funcionamento (a cozinha fecha antes da casa), por isso
   * e um campo proprio e nao derivado de `hours`.
   */
  reservationHours: string
  /** Faixa de preco, couvert, taxa de servico — o que evita pergunta repetida. */
  prices: string
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
  address: '',
  reservationHours: '',
  prices: '',
  capabilities: ['duvidas', 'cardapio', 'reservas', 'agendar'],
  about: '',
}

/**
 * Monta o prompt_completo a partir das escolhas do modo simples.
 *
 * Duas regras de ouro aqui:
 *
 * 1. Campo vazio NAO vira secao. Versoes antigas emitiam o cabecalho de
 *    qualquer jeito, e o prompt chegava no modelo cheio de "## ENDEREÇO"
 *    seguido de nada — pior ainda, com frases penduradas do tipo "Só ofereça
 *    reservas dentro destes horários:" sem horario nenhum depois. Isso nao e
 *    so feio: instrucao vazia confunde o modelo e gasta contexto a toa.
 *
 * 2. Os fatos da casa ficam JUNTOS, em linhas rotuladas, e nao espalhados em
 *    quatro cabecalhos de uma linha cada. Endereco, funcionamento, reservas e
 *    preco sao a mesma coisa pro modelo — dados do restaurante — e agrupados
 *    ficam mais faceis de consultar do que picotados.
 */
export function buildPromptCompleto(s: SimpleForm): string {
  const tone = TONES.find((t) => t.value === s.tone)?.promptText || ''
  const verb = VERBOSITY.find((v) => v.value === s.verbosity)?.promptText || ''
  const estilo = [tone, verb].filter(Boolean).join(' ')

  const caps = CAPABILITIES.filter((c) => s.capabilities.includes(c.value))
    .map((c) => `- ${c.promptText}`)
    .join('\n')

  const nome = s.aiName.trim() || 'o atendente virtual'
  const rest = s.restaurantName.trim()

  // Fatos da casa: so entram os preenchidos, cada um numa linha rotulada.
  const fatos = [
    s.address.trim() && `Endereço: ${s.address.trim()}`,
    s.hours.trim() && `Funcionamento: ${s.hours.trim()}`,
    s.reservationHours.trim() && `Horários para reserva: ${s.reservationHours.trim()}`,
    s.prices.trim() && `Preços: ${s.prices.trim()}`,
  ].filter(Boolean)

  // Regras condicionais: so aparecem quando ha dado que as sustente. Mandar a
  // IA respeitar um horario que ela nao conhece e o caminho pra ela inventar.
  const regras = [
    '- Responda em português do Brasil, de forma clara e direta.',
    s.reservationHours.trim() &&
      '- Só ofereça e registre reservas dentro dos horários para reserva informados acima.',
    '- Antes de registrar uma reserva, confirme com o cliente: nome, data, horário e número de pessoas.',
    '- Para consultar disponibilidade, reservar ou agendar, use SEMPRE as ferramentas (tools) disponíveis. Nunca invente confirmação, horário ou número de reserva.',
    '- Se a informação não estiver aqui, diga que vai verificar e ofereça encaminhar para um atendente humano. Não invente.',
  ].filter(Boolean)

  return [
    `Você é ${nome}, atendente virtual${rest ? ` do restaurante ${rest}` : ''}. Atenda os clientes pelo WhatsApp.`,
    estilo && `\n## COMO FALAR\n${estilo}`,
    fatos.length && `\n## O RESTAURANTE\n${fatos.join('\n')}`,
    s.about.trim() && `\n## MAIS SOBRE A CASA\n${s.about.trim()}`,
    caps && `\n## O QUE VOCÊ PODE FAZER\n${caps}`,
    `\n## REGRAS\n${regras.join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Le o `simple` gravado e devolve SO os campos que existem hoje.
 *
 * Registros antigos carregam lixo de versoes anteriores — `template` (com
 * placeholders {{tom}} que ninguem mais interpreta), `temperament`,
 * `serviceStyle`. Espalhar o objeto salvo direto no formulario faria esse
 * lixo ser regravado a cada salvamento, para sempre. Aqui ele fica de fora e
 * o proximo save limpa o registro.
 *
 * Campos que sobreviveram a refatoracao (endereco, precos, horarios de
 * reserva) sao preservados: quem preencheu na versao antiga nao perde nada.
 */
export function normalizeSimpleForm(bruto: unknown): SimpleForm {
  const s = (bruto || {}) as Partial<SimpleForm>
  const texto = (v: unknown) => (typeof v === 'string' ? v : '')

  return {
    aiName: texto(s.aiName),
    restaurantName: texto(s.restaurantName),
    tone: TONES.some((t) => t.value === s.tone) ? s.tone! : DEFAULT_SIMPLE_FORM.tone,
    verbosity: VERBOSITY.some((v) => v.value === s.verbosity)
      ? s.verbosity!
      : DEFAULT_SIMPLE_FORM.verbosity,
    hours: texto(s.hours),
    address: texto(s.address),
    reservationHours: texto(s.reservationHours),
    prices: texto(s.prices),
    capabilities: Array.isArray(s.capabilities)
      ? s.capabilities.filter((c) => CAPABILITIES.some((cap) => cap.value === c))
      : DEFAULT_SIMPLE_FORM.capabilities,
    about: texto(s.about),
  }
}

export interface AgentChoices {
  ai_name: string | null
  restaurant_name: string | null
  tone: string | null
  tone_label: string | null
  verbosity: string | null
  verbosity_label: string | null
  hours: string | null
  address: string | null
  reservation_hours: string | null
  prices: string | null
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
    address: simple.address ?? null,
    reservation_hours: simple.reservationHours ?? null,
    prices: simple.prices ?? null,
    about: simple.about ?? null,
    capabilities: (simple.capabilities ?? []).map((c) => ({
      value: c,
      label: CAPABILITIES.find((cap) => cap.value === c)?.label ?? c,
    })),
  }
}
