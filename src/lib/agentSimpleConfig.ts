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
  /** Endereco completo: a IA precisa dele pra informar como chegar. */
  address: string
  /**
   * Janela em que a IA pode oferecer e registrar reserva. Costuma ser MENOR
   * que o horario de funcionamento (a cozinha fecha antes da casa), por isso
   * e um campo proprio e nao derivado de `hours`.
   */
  reservationHours: string
  /** Faixa de preco, couvert, taxa de servico: o que evita pergunta repetida. */
  prices: string
  capabilities: string[]
  /** "Sobre a casa": proposta, historia, jeito da casa (sai no texto como "MAIS SOBRE A CASA"). */
  about: string
  /**
   * Saudacao da primeira resposta da conversa. {nome} = primeiro nome do
   * cliente; {resposta} = onde entra a resposta ao que o cliente disse.
   */
  greeting: string
  /** Links que a IA pode mandar (cardapio, Instagram, delivery, mapa...), um por linha. */
  links: string
  /** O que a IA nunca diz nem faz. Vale acima do resto do texto. */
  limitations: string
  /** Regras e excecoes que nao cabem nos outros campos. */
  instructions: string
}

export const TONES = [
  { value: 'amigavel', label: 'Amigável', hint: 'Caloroso e simpático', promptText: 'Fale de forma calorosa, simpática e próxima, como um bom anfitrião recebendo o cliente.' },
  { value: 'formal', label: 'Formal', hint: 'Educado e profissional', promptText: 'Mantenha um tom educado, profissional e respeitoso o tempo todo.' },
  { value: 'descontraido', label: 'Descontraído', hint: 'Leve e divertido', promptText: 'Use um tom leve, descontraído e bem-humorado, sem perder a clareza.' },
] as const

export const VERBOSITY = [
  { value: 'objetivo', label: 'Fala pouco', hint: 'Respostas curtas e diretas', promptText: 'Seja objetivo: respostas curtas e diretas, sem rodeios.' },
  { value: 'equilibrado', label: 'Equilibrado', hint: 'Nem curto nem longo', promptText: 'Mantenha as respostas equilibradas: claras e completas, sem alongar demais.' },
  { value: 'detalhado', label: 'Fala muito', hint: 'Respostas completas e explicativas', promptText: 'Seja detalhado: explique bem, com contexto e exemplos quando ajudar.' },
] as const

export const CAPABILITIES = [
  { value: 'duvidas', label: 'Tirar dúvidas', promptText: 'Responder dúvidas gerais dos clientes sobre o restaurante.' },
  { value: 'cardapio', label: 'Informar cardápio e preços', promptText: 'Informar pratos, cardápio e preços quando o cliente perguntar.' },
  { value: 'reservas', label: 'Registrar reservas', promptText: 'Ajudar o cliente a reservar uma mesa, coletando nome, data, horário e número de pessoas, e confirmando antes de registrar.' },
  { value: 'agendar', label: 'Agendar com as ferramentas', promptText: 'Usar as ferramentas (tools) disponíveis para consultar disponibilidade, criar e confirmar reservas/agendamentos diretamente no sistema. Sempre conclua a ação pelas ferramentas: nunca invente uma confirmação.' },
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
  greeting: '',
  links: '',
  limitations: '',
  instructions: '',
}

/** Campos de texto livre do modo simples. */
export type CampoTextoSimples =
  | 'aiName'
  | 'restaurantName'
  | 'address'
  | 'hours'
  | 'reservationHours'
  | 'prices'
  | 'about'
  | 'greeting'
  | 'links'
  | 'limitations'
  | 'instructions'

export interface InfoCampo {
  rotulo: string
  /** Para que serve: o que a tela mostra embaixo do campo (e o MCP explica). */
  paraQueServe: string
  exemplo: string
  /** Limite de caracteres (a tela e o MCP recusam acima disso). */
  max: number
  /** Restaurante do Reserve Maya: este dado ja vem do sistema de reservas. */
  vemDoReserveMaya?: boolean
}

/**
 * Fonte unica de rotulo, explicacao e limite de cada campo de texto: a tela
 * usa daqui e o MCP vai usar os mesmos (sem isso, cada lado teria um limite).
 */
export const CAMPOS_TEXTO: Record<CampoTextoSimples, InfoCampo> = {
  aiName: { rotulo: 'Nome da IA', paraQueServe: 'Como a IA se apresenta.', exemplo: 'Sofia', max: 60 },
  restaurantName: { rotulo: 'Nome do restaurante', paraQueServe: 'Nome da casa, como o cliente conhece.', exemplo: 'Cantina da Nonna', max: 120 },
  address: { rotulo: 'Endereço', paraQueServe: 'Endereço completo, para a IA informar como chegar.', exemplo: 'Rua das Flores, 120, Setor Bueno, Goiânia', max: 300 },
  hours: {
    rotulo: 'Horário de funcionamento',
    paraQueServe: 'Dias e horários em que a casa abre.',
    exemplo: 'Seg a sex 11h-15h e 18h-23h. Sáb e dom 12h-23h.',
    max: 600,
    vemDoReserveMaya: true,
  },
  reservationHours: {
    rotulo: 'Horários para reserva',
    paraQueServe: 'Janela em que a IA pode oferecer reserva (costuma ser menor que o funcionamento).',
    exemplo: '19h às 22h, de terça a domingo',
    max: 300,
    vemDoReserveMaya: true,
  },
  prices: {
    rotulo: 'Preços',
    paraQueServe: 'Faixa de preço, couvert, taxa de serviço.',
    exemplo: 'Pratos de R$ 45 a R$ 90. Couvert R$ 18. Taxa de serviço 10%.',
    max: 600,
    vemDoReserveMaya: true,
  },
  about: {
    rotulo: 'Sobre a casa',
    paraQueServe: 'A proposta e o jeito da casa, para a IA falar como alguém de lá. Perguntas e respostas vão na base de conhecimento.',
    exemplo: 'Restaurante saudável e health hub em Brasília, criado por quatro sócias. Ambiente leve e acolhedor.',
    max: 3000,
  },
  greeting: {
    rotulo: 'Saudação inicial',
    paraQueServe:
      'Vai só na primeira resposta da conversa, do jeito que está escrita. {nome} vira o primeiro nome do cliente; {resposta} marca onde entra a resposta ao que ele perguntou (sem {resposta}, ela vem logo depois da saudação).',
    exemplo: 'Oii {nome}! Me chamo Sofia e é um prazer ter você aqui. 🧡\n\n{resposta}\n\nGostaria de fazer uma reserva?',
    max: 1500,
  },
  links: {
    rotulo: 'Links',
    paraQueServe: 'Um por linha. A IA manda quando o cliente pedir ou quando ajudar na resposta.',
    exemplo: 'Cardápio: https://...\nInstagram: @suacasa\nDelivery: https://...',
    max: 1000,
  },
  limitations: {
    rotulo: 'Limitações',
    paraQueServe: 'O que a IA nunca diz nem faz, um item por linha. Vale acima de qualquer outra instrução deste texto.',
    exemplo: 'Nunca informar valores de eventos\nNão indicar pratos: mandar o link do cardápio\nNão usar a palavra "memorável"',
    max: 2000,
  },
  instructions: {
    rotulo: 'Instruções extras',
    paraQueServe: 'Regras ou exceções que não cabem nos outros campos.',
    exemplo: 'Aos domingos o almoço é só por ordem de chegada.',
    max: 3000,
  },
}

/** Campos que o MCP pode alterar: os de texto livre mais tom e "como a IA responde". */
export type CampoEditavel = CampoTextoSimples | 'tone' | 'verbosity'

/**
 * Nome de cada campo no MCP (o Hermes fala portugues). A ordem e a da tela.
 * `capabilities` fica de fora: nao aparece mais na tela.
 */
export const CAMPOS_MCP: { nome: string; campo: CampoEditavel }[] = [
  { nome: 'nome_ia', campo: 'aiName' },
  { nome: 'nome_restaurante', campo: 'restaurantName' },
  { nome: 'tom', campo: 'tone' },
  { nome: 'como_responde', campo: 'verbosity' },
  { nome: 'saudacao_inicial', campo: 'greeting' },
  { nome: 'endereco', campo: 'address' },
  { nome: 'horario_funcionamento', campo: 'hours' },
  { nome: 'horarios_reserva', campo: 'reservationHours' },
  { nome: 'precos', campo: 'prices' },
  { nome: 'sobre_a_casa', campo: 'about' },
  { nome: 'links', campo: 'links' },
  { nome: 'limitacoes', campo: 'limitations' },
  { nome: 'instrucoes_extras', campo: 'instructions' },
]

/**
 * Monta o prompt_completo a partir das escolhas do modo simples.
 *
 * Duas regras de ouro aqui:
 *
 * 1. Campo vazio NAO vira secao. Versoes antigas emitiam o cabecalho de
 *    qualquer jeito, e o prompt chegava no modelo cheio de "## ENDEREÇO"
 *    seguido de nada: pior ainda, com frases penduradas do tipo "Só ofereça
 *    reservas dentro destes horários:" sem horario nenhum depois. Isso nao e
 *    so feio: instrucao vazia confunde o modelo e gasta contexto a toa.
 *
 * 2. Os fatos da casa ficam JUNTOS, em linhas rotuladas, e nao espalhados em
 *    quatro cabecalhos de uma linha cada. Endereco, funcionamento, reservas e
 *    preco sao a mesma coisa pro modelo: dados do restaurante: e agrupados
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

  // Campos novos: cada um so vira secao quando preenchido. Vazios, o texto sai
  // IDENTICO ao de antes deles existirem; e isso que mantem os agentes ja
  // salvos reconhecidos como "modo simples" (a tela compara o texto salvo com
  // o que este formulario gera).
  const saudacao = s.greeting.trim()
  const links = s.links.trim()
  const limitacoes = s.limitations.trim()
  const extras = s.instructions.trim()

  return [
    `Você é ${nome}, atendente virtual${rest ? ` do restaurante ${rest}` : ''}. Atenda os clientes pelo WhatsApp.`,
    estilo && `\n## COMO FALAR\n${estilo}`,
    saudacao && `\n## SAUDAÇÃO INICIAL\n${instrucaoDaSaudacao(saudacao)}`,
    fatos.length && `\n## O RESTAURANTE\n${fatos.join('\n')}`,
    s.about.trim() && `\n## MAIS SOBRE A CASA\n${s.about.trim()}`,
    links &&
      `\n## LINKS\nMande o link quando o cliente pedir ou quando ajudar na resposta, com o endereço completo e sem formatação:\n${links}`,
    caps && `\n## O QUE VOCÊ PODE FAZER\n${caps}`,
    `\n## REGRAS\n${regras.join('\n')}`,
    limitacoes &&
      `\n## LIMITAÇÕES\nNunca faça nem diga o que está abaixo, mesmo que outra parte deste texto pareça permitir:\n${limitacoes}`,
    extras && `\n## INSTRUÇÕES EXTRAS\n${extras}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Como usar a saudacao. O texto vai como esta (e decisao do restaurante); o
 * que a IA adapta e so o nome, o idioma e a resposta no lugar de {resposta}.
 * "Primeira resposta" quem decide no Maestro e o sistema (linha no Contexto),
 * nao a memoria do modelo: assim ela nao se repete.
 */
function instrucaoDaSaudacao(saudacao: string): string {
  const temResposta = saudacao.includes('{resposta}')
  return [
    'Na sua primeira resposta da conversa, use a saudação abaixo do jeito que está escrita, sem resumir nem reescrever.',
    '- Troque {nome} pelo primeiro nome do cliente. Sem o nome, tire o {nome} e ajuste só o necessário para a frase ficar natural.',
    temResposta
      ? '- No lugar de {resposta}, responda ao que o cliente disse, adaptando ao contexto. Se ele só cumprimentou, tire o {resposta}.'
      : '- Se o cliente já perguntou ou pediu algo, responda logo depois da saudação, na mesma resposta.',
    '- Se o cliente escrever em outro idioma, traduza a saudação mantendo o sentido.',
    '- Nas respostas seguintes, não repita a saudação nem se apresente de novo.',
    'Saudação (entre as linhas ---):',
    '---',
    saudacao,
    '---',
  ].join('\n')
}

/**
 * Le o `simple` gravado e devolve SO os campos que existem hoje.
 *
 * Registros antigos carregam lixo de versoes anteriores: `template` (com
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
    greeting: texto(s.greeting),
    links: texto(s.links),
    limitations: texto(s.limitations),
    instructions: texto(s.instructions),
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
 *
 * Saudacao, links, limitacoes e instrucoes extras ficam de fora DE PROPOSITO:
 * isto sai no GET /api/ai-configurations que o n8n le, e a resposta dele nao
 * muda. O texto delas ja vai dentro do prompt_completo.
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
