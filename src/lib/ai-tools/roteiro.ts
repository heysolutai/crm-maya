/**
 * Roteiro de ferramentas do prompt da IA: QUANDO e COMO usar cada ferramenta
 * ligada pro restaurante, em passos. Montado sozinho a partir das ferramentas
 * ligadas (o restaurante nao escreve nada disso): so entra a parte de reservas
 * se ha ferramenta de reserva, a de eventos se ha a de eventos, etc.
 *
 * As ferramentas externas sao reconhecidas pelo PAPEL (verificar vaga, criar,
 * consultar, alterar, cancelar, informacoes da casa, eventos especiais), seja
 * a integracao HTTP do catalogo ("verificar_disponibilidade") ou o servidor MCP
 * do Reserve Maya ("check_availability", que no CRM vira
 * "reservemaya_check_availability"). O texto cita o nome real que a IA recebe.
 *
 * Fronteiras fixas (nao dependem do texto das regras, que o restaurante edita):
 *   - evento ESPECIAL da casa (programacao, reserva paga) e reserva; evento
 *     PERSONALIZADO (o cliente monta o proprio) vai para encaminhar_para_eventos;
 *   - grupo grande que so quer mesa tenta a reserva antes de virar evento;
 *   - alterar/consultar/cancelar reserva nao e motivo para transferir;
 *   - informacoes de reserva (turnos, antecedencia) vem do sistema de reservas;
 *     o resto da casa, da base de conhecimento; uma completa a outra.
 *
 * Funcao pura (sem banco): o Maestro, o "Testar a IA" e GET /api/ai-tools
 * (n8n) recebem exatamente o mesmo texto.
 */

export interface FerramentaDoRoteiro {
  name: string
  label: string
  promptHint: string | null
  isWrite: boolean
  /** native = acao do CRM; integration = catalogo HTTP ou servidor MCP. */
  source?: 'native' | 'integration'
  /** Linhas proprias da secao desta ferramenta (ex.: regras de encaminhamento do restaurante). */
  roteiro?: string[]
  /** Ferramenta de servidor MCP: o nome dela no servidor (o CRM prefixa o nome que a IA ve). */
  mcp?: { toolName: string }
}

/** O que a ferramenta externa faz, independente do nome que ela tem. */
export type Papel = 'disponibilidade' | 'criar' | 'consultar' | 'alterar' | 'cancelar' | 'info_casa' | 'eventos_especiais'

/** Nomes conhecidos: integracao HTTP do catalogo e servidor MCP do Reserve Maya. */
const PAPEL_POR_NOME: Record<string, Papel> = {
  verificar_disponibilidade: 'disponibilidade',
  check_availability: 'disponibilidade',
  criar_reserva: 'criar',
  create_reservation: 'criar',
  consultar_reserva: 'consultar',
  get_my_reservations: 'consultar',
  alterar_reserva: 'alterar',
  update_my_reservation: 'alterar',
  cancelar_reserva: 'cancelar',
  cancel_my_reservation: 'cancelar',
  get_restaurant_info: 'info_casa',
}

/** Nativas que o roteiro explica pelo nome (o resto vai em "Outras"). */
const NATIVAS_EXPLICADAS = new Set([
  'registrar_reserva',
  'consultar_eventos',
  'registrar_inscricao_evento',
  'encaminhar_para_eventos',
  // Explicada nos passos de cada regra de evento (roteiroEventos).
  'apresentar_evento_personalizado',
  'buscar_conhecimento',
  'transferir_para_humano',
])

/**
 * Papel de uma ferramenta externa. Nativa nunca tem papel (as nativas de
 * eventos tem "evento" no nome e nao sao do sistema de reservas).
 */
export function papelDe(f: Pick<FerramentaDoRoteiro, 'name' | 'source' | 'mcp'>): Papel | null {
  if (f.source === 'native' || NATIVAS_EXPLICADAS.has(f.name)) return null
  const nome = (f.mcp?.toolName ?? f.name).toLowerCase()
  const conhecido = PAPEL_POR_NOME[nome]
  if (conhecido) return conhecido
  if (/event|evento/.test(nome)) return 'eventos_especiais'
  if (/restaurant_info|info_restaurante|info_da_casa|informacoes_da_casa/.test(nome)) return 'info_casa'
  return null
}

type Nomes = Partial<Record<Papel, string[]>>

/** "a" | "a ou b" para citar as ferramentas de um papel. */
function citar(nomes: string[] | undefined): string | null {
  if (!nomes?.length) return null
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`
}

function temReservaExterna(p: Nomes): boolean {
  return !!(p.disponibilidade || p.criar || p.consultar || p.alterar || p.cancelar)
}

function secaoReservas(p: Nomes, tem: (n: string) => boolean): string[] {
  const disp = citar(p.disponibilidade)
  const criar = citar(p.criar)
  const consultar = citar(p.consultar)
  const alterar = citar(p.alterar)
  const cancelar = citar(p.cancelar)
  const registrar = tem('registrar_reserva') && !criar
  if (!temReservaExterna(p) && !registrar) return []

  const linhas = ['### Reservas']
  let n = 1
  linhas.push(
    `${n++}. Junte data, horário e número de pessoas. Pergunte só o que faltar, uma coisa por vez. Converta "hoje", "amanhã", "sábado", "sexta que vem" para a data AAAA-MM-DD do calendário abaixo; horário em HH:MM (24h, ex.: 20:00).`
  )
  if (disp) {
    linhas.push(
      `${n++}. Assim que tiver os dados que ${disp} pede, chame-a ANTES de oferecer ou prometer qualquer horário. Ofereça só os horários que ela devolver livres. Sem vaga: ofereça as alternativas que ela trouxer; se não trouxer nenhuma, pergunte outro horário ou dia.`
    )
  }
  if (criar) {
    linhas.push(
      `${n++}. Com vaga, confirme numa frase: data com o dia da semana, como está no calendário, horário, número de pessoas e o nome da reserva (se não souber o nome, pergunte). Pergunte se pode reservar.`,
      `${n++}. Só depois do "sim" do cliente, chame ${criar} (o telefone do cliente vai sozinho; não peça). Mande ao cliente a confirmação e o link, o código ou o Pix que a ferramenta devolveu, exatamente como vieram.`
    )
  } else if (registrar) {
    linhas.push(
      `${n++}. Confirme com o cliente data, horário, número de pessoas e nome. Só depois do "sim", chame registrar_reserva e avise que a reserva foi anotada.`
    )
  }
  if (consultar) {
    linhas.push(`- Para consultar uma reserva: chame ${consultar} (se ela pedir o código, peça ao cliente). Informe os dados exatamente como vierem.`)
  }
  if (alterar) {
    linhas.push(
      `- Para alterar: ${consultar ? `identifique a reserva com ${consultar}, ` : ''}${disp ? `confira a vaga do novo horário com ${disp}, ` : ''}repita os dados novos, espere um "sim" claro e só então chame ${alterar}.`
    )
  }
  if (cancelar) {
    linhas.push(
      `- Para cancelar: ${consultar ? `identifique a reserva com ${consultar}, ` : ''}repita os dados da reserva, espere um "sim" claro e só então chame ${cancelar}.`
    )
  }
  const acoes = citar([consultar && 'consultar', alterar && 'alterar', cancelar && 'cancelar'].filter((a): a is string => !!a))
  if (acoes && tem('transferir_para_humano')) {
    linhas.push(
      `- ${acoes.charAt(0).toUpperCase()}${acoes.slice(1)} uma reserva não é motivo para transferir: use as ferramentas acima. Transfira só se a ferramenta falhar duas vezes, se o cliente pedir uma pessoa, ou num problema que elas não resolvem (cobrança, reembolso, reserva que não aparece).`
    )
  }
  linhas.push('- Nunca diga que a reserva está feita, alterada, confirmada ou cancelada sem a ferramenta ter confirmado nesta conversa.')
  return linhas
}

function secaoEventos(p: Nomes, tem: (n: string) => boolean, proprio: (n: string) => string[] | undefined): string[] {
  const especiais = citar(p.eventos_especiais)
  const personalizado = tem('encaminhar_para_eventos')
  if (!tem('consultar_eventos') && !personalizado && !especiais) return []
  const linhas = ['### Eventos']

  // Fronteira: os dois tipos tem "evento" no nome e nao se misturam.
  if (personalizado) {
    const criar = citar(p.criar)
    const fonte = citar(p.info_casa) ?? (tem('buscar_conhecimento') ? 'buscar_conhecimento' : null)
    const como = especiais
      ? `use ${especiais}${criar ? ` (ou ${criar} para reservar)` : ''}`
      : [fonte && `informações com ${fonte}`, criar && `reserva com ${criar}`].filter(Boolean).join('; ') || 'responda só com o que a casa informou'
    const ehReserva = especiais || criar ? 'Isso é RESERVA, não evento personalizado' : 'Isso não é evento personalizado'
    linhas.push(
      '- Há dois tipos de evento, e eles não se misturam:',
      `  • Evento ESPECIAL da casa: uma data da programação do restaurante (show, réveillon, Dia das Mães, data comemorativa), em geral com reserva paga. ${ehReserva}: ${como}. Nunca use encaminhar_para_eventos para ele.`,
      '  • Evento PERSONALIZADO: o cliente quer montar o próprio evento (cardápio fechado, corporativo, casamento, fechar o espaço). Não é reserva: siga as regras abaixo.',
      '- Se não der para saber qual dos dois, pergunte se ele quer participar de um evento da programação da casa ou montar um evento só dele.'
    )
    if (temReservaExterna(p)) {
      linhas.push(
        `- Grupo grande que só quer mesa (sem cardápio fechado nem espaço exclusivo): tente a reserva normal primeiro${citar(p.disponibilidade) ? ` com ${citar(p.disponibilidade)}` : ''}. Encaminhe para eventos só se o sistema de reservas recusar pelo tamanho do grupo ou disser que o pedido deve ir para a equipe de eventos.`
      )
    }
  } else if (especiais) {
    linhas.push(
      `- Programação e eventos especiais da casa (show, réveillon, data comemorativa): use ${especiais}. Repita datas, valores e links exatamente como vierem.`
    )
  }

  if (tem('consultar_eventos')) {
    linhas.push(
      '- Se o cliente perguntar sobre eventos, shows, festas, datas especiais ou programação: chame consultar_eventos sem parâmetro e mostre a lista (nome, data e valor). Quando ele escolher um, chame consultar_eventos com o evento: os detalhes vêm e as fotos são enviadas sozinhas.',
      '- Não invente evento, data, valor ou vagas: use só o que consultar_eventos devolver.'
    )
  }
  if (tem('registrar_inscricao_evento')) {
    linhas.push(
      '- Para inscrever: peça o nome, quantas pessoas vão e os dados extras que o evento pedir. Confirme com o cliente e só então chame registrar_inscricao_evento. Informe o que a ferramenta devolver (inclusive vagas restantes).'
    )
  }
  if (personalizado) {
    const regras = proprio('encaminhar_para_eventos')
    if (regras?.length) linhas.push(...regras)
    else {
      linhas.push(
        '- Evento personalizado (aniversário com cardápio fechado, confraternização, corporativo, fechar o espaço): pegue tipo, data e número de pessoas e chame encaminhar_para_eventos com um resumo. Avise que a equipe de eventos vai entrar em contato.'
      )
    }
  }
  return linhas
}

function secaoDuvidas(p: Nomes, tem: (n: string) => boolean): string[] {
  const faq = tem('buscar_conhecimento')
  const info = citar(p.info_casa)
  if (!faq && !info) return []
  const linhas = ['### Dúvidas sobre a casa']
  if (faq && info) {
    linhas.push(
      `- Horários e turnos de funcionamento, antecedência e regras de reserva: chame ${info} (sistema de reservas). Neste assunto ele vale mais que a base de conhecimento.`,
      '- Cardápio, pratos, preços, opções vegetarianas, bebidas, formas de pagamento, estacionamento, pet, crianças, acessibilidade e as demais regras da casa: chame buscar_conhecimento com a pergunta do cliente ANTES de responder, mesmo que pareça simples.',
      `- Se a primeira consulta não trouxer a resposta, consulte a outra (${info} ou buscar_conhecimento) antes de dizer que vai verificar.`,
      '- Responda só com o que vier. Se nenhuma das duas trouxer a resposta, diga que vai confirmar com a equipe; não complete com suposição.'
    )
  } else if (faq) {
    linhas.push(
      '- Cardápio, pratos, preços, opções vegetarianas, bebidas, formas de pagamento, estacionamento, pet, crianças, acessibilidade e qualquer regra da casa: chame buscar_conhecimento com a pergunta do cliente ANTES de responder, mesmo que pareça simples.',
      '- Responda só com o que vier. Se não vier a resposta, diga que vai confirmar com a equipe; não complete com suposição.'
    )
  } else {
    linhas.push(
      `- Horários, turnos, regras de reserva e informações da casa: chame ${info} ANTES de responder.`,
      '- Responda só com o que vier. Se não vier a resposta, diga que vai confirmar com a equipe; não complete com suposição.'
    )
  }
  return linhas
}

function secaoAtendente(tem: (n: string) => boolean, proprio: (n: string) => string[] | undefined): string[] {
  if (!tem('transferir_para_humano')) return []
  const regras = proprio('transferir_para_humano')
  if (regras?.length) return ['### Quando chamar um atendente', ...regras]
  return [
    '### Quando chamar um atendente',
    '- Chame transferir_para_humano quando: o cliente pedir para falar com uma pessoa; houver reclamação ou um problema com pedido/reserva que as ferramentas não resolvem; o pedido for algo que você não consegue fazer com as ferramentas; ou uma ferramenta falhar duas vezes.',
    '- Avise o cliente que um atendente vai continuar e não responda mais nada depois disso.',
  ]
}

function secaoOutras(ferramentas: FerramentaDoRoteiro[]): string[] {
  const outras = ferramentas.filter((f) => !NATIVAS_EXPLICADAS.has(f.name) && !papelDe(f))
  if (!outras.length) return []
  return [
    '### Outras ferramentas',
    ...outras.map((f) => {
      const dica = f.promptHint?.trim() ? `: ${f.promptHint.trim()}` : ''
      const confirma = f.isWrite ? ' (muda dados: confirme com o cliente antes de chamar)' : ''
      return `- ${f.name} (${f.label})${dica}${confirma}`
    }),
  ]
}

export function montarRoteiro(ferramentas: FerramentaDoRoteiro[]): string {
  if (!ferramentas.length) return ''
  const nomes = new Set(ferramentas.map((f) => f.name))
  const tem = (n: string) => nomes.has(n)
  const proprio = (n: string) => ferramentas.find((f) => f.name === n)?.roteiro
  const porPapel: Nomes = {}
  for (const f of ferramentas) {
    const papel = papelDe(f)
    if (papel) (porPapel[papel] ??= []).push(f.name)
  }

  const blocos = [
    secaoReservas(porPapel, tem),
    secaoEventos(porPapel, tem, proprio),
    secaoDuvidas(porPapel, tem),
    secaoAtendente(tem, proprio),
    secaoOutras(ferramentas),
  ].filter((b) => b.length)

  return [
    '## Ferramentas: quando e como usar',
    'Regra de ouro: horário livre, reserva, evento, cardápio, preço e regra da casa vêm SEMPRE de uma ferramenta chamada nesta conversa. Consulte antes de responder; nunca responda de memória nem invente.',
    '- Quando e como usar cada ferramenta, encaminhar ou transferir: siga este roteiro, mesmo que alguma instrução acima diga diferente.',
    '- Chame a ferramenta assim que tiver os dados que ela pede. Não avise "vou verificar" sem chamar: chame e já responda com o resultado.',
    '- Se a resposta da ferramenta pedir um dado, pergunte ao cliente. Se disser que não conseguiu, peça desculpas, não diga que a ação foi feita e ofereça um atendente.',
    '- Repita datas, horários, valores, links e códigos exatamente como a ferramenta devolveu.',
    ...blocos.map((b) => `\n${b.join('\n')}`),
  ].join('\n')
}
