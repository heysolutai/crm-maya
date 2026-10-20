/**
 * Roteiro de ferramentas do prompt da IA: QUANDO e COMO usar cada ferramenta
 * ligada pro restaurante, em passos. Montado sozinho a partir das ferramentas
 * ligadas (o restaurante nao escreve nada disso): so entra a parte de reservas
 * se ha ferramenta de reserva, a de eventos se ha a de eventos, etc.
 *
 * Funcao pura (sem banco): o Maestro, o "Testar a IA" e GET /api/ai-tools
 * (n8n) recebem exatamente o mesmo texto.
 */

export interface FerramentaDoRoteiro {
  name: string
  label: string
  promptHint: string | null
  isWrite: boolean
}

/** Ferramentas que o roteiro ja explica pelo nome (o resto vai em "Outras"). */
const RESERVA_EXTERNA = ['verificar_disponibilidade', 'criar_reserva', 'consultar_reserva', 'cancelar_reserva']
const EXPLICADAS = new Set([
  ...RESERVA_EXTERNA,
  'registrar_reserva',
  'consultar_eventos',
  'registrar_inscricao_evento',
  'encaminhar_para_eventos',
  'buscar_conhecimento',
  'transferir_para_humano',
])

function secaoReservas(tem: (n: string) => boolean): string[] {
  const externa = RESERVA_EXTERNA.some(tem)
  if (!externa && !tem('registrar_reserva')) return []

  const linhas = ['### Reservas']
  linhas.push(
    '1. Junte data, horário e número de pessoas. Pergunte só o que faltar, uma coisa por vez. Converta "hoje", "amanhã", "sábado", "sexta que vem" para a data AAAA-MM-DD do calendário abaixo; horário em HH:MM (24h, ex.: 20:00).'
  )
  if (tem('verificar_disponibilidade')) {
    linhas.push(
      '2. Com os três dados, chame verificar_disponibilidade ANTES de prometer qualquer coisa. Responda com o que ela devolveu, com as mesmas datas e horários. Sem vaga: ofereça as alternativas que ela trouxer; se não trouxer nenhuma, pergunte outro horário ou dia.'
    )
  }
  if (tem('criar_reserva')) {
    linhas.push(
      `${tem('verificar_disponibilidade') ? '3' : '2'}. Com vaga, confirme numa frase: data com o dia da semana, como está no calendário, horário, número de pessoas e o nome da reserva (se não souber o nome, pergunte). Pergunte se pode reservar.`,
      `${tem('verificar_disponibilidade') ? '4' : '3'}. Só depois do "sim" do cliente, chame criar_reserva (o telefone do cliente vai sozinho; não peça). Mande ao cliente a confirmação e o link ou código que a ferramenta devolveu, exatamente como vieram.`
    )
  } else if (tem('registrar_reserva')) {
    linhas.push(
      '2. Confirme com o cliente data, horário, número de pessoas e nome. Só depois do "sim", chame registrar_reserva e avise que a reserva foi anotada.'
    )
  }
  if (tem('consultar_reserva')) {
    linhas.push('- Para consultar uma reserva: peça o código da reserva e chame consultar_reserva. Informe os dados exatamente como vierem.')
  }
  if (tem('cancelar_reserva')) {
    linhas.push(
      '- Para cancelar: peça o código, confira os dados com consultar_reserva (se disponível), confirme com o cliente e só então chame cancelar_reserva.'
    )
  }
  linhas.push('- Nunca diga que a reserva está feita, confirmada ou cancelada sem a ferramenta ter confirmado nesta conversa.')
  return linhas
}

function secaoEventos(tem: (n: string) => boolean): string[] {
  if (!tem('consultar_eventos') && !tem('encaminhar_para_eventos')) return []
  const linhas = ['### Eventos']
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
  if (tem('encaminhar_para_eventos')) {
    linhas.push(
      '- Evento particular (aniversário, confraternização, grupo grande, fechar o espaço): pegue tipo, data e número de pessoas e chame encaminhar_para_eventos com um resumo. Avise que a equipe de eventos vai entrar em contato.'
    )
  }
  return linhas
}

function secaoDuvidas(tem: (n: string) => boolean): string[] {
  if (!tem('buscar_conhecimento')) return []
  return [
    '### Dúvidas sobre a casa',
    '- Cardápio, pratos, preços, opções vegetarianas, bebidas, formas de pagamento, estacionamento, pet, crianças, acessibilidade e qualquer regra da casa: chame buscar_conhecimento com a pergunta do cliente ANTES de responder, mesmo que pareça simples.',
    '- Responda só com o que vier. Se não vier a resposta, diga que vai confirmar com a equipe; não complete com suposição.',
  ]
}

function secaoAtendente(tem: (n: string) => boolean): string[] {
  if (!tem('transferir_para_humano')) return []
  return [
    '### Quando chamar um atendente',
    '- Chame transferir_para_humano quando: o cliente pedir para falar com uma pessoa; houver reclamação ou problema com pedido/reserva; o pedido for algo que você não consegue fazer com as ferramentas; ou uma ferramenta falhar duas vezes.',
    '- Avise o cliente que um atendente vai continuar e não responda mais nada depois disso.',
  ]
}

function secaoOutras(ferramentas: FerramentaDoRoteiro[]): string[] {
  const outras = ferramentas.filter((f) => !EXPLICADAS.has(f.name))
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

  const blocos = [
    secaoReservas(tem),
    secaoEventos(tem),
    secaoDuvidas(tem),
    secaoAtendente(tem),
    secaoOutras(ferramentas),
  ].filter((b) => b.length)

  return [
    '## Ferramentas: quando e como usar',
    'Regra de ouro: horário livre, reserva, evento, cardápio, preço e regra da casa vêm SEMPRE de uma ferramenta chamada nesta conversa. Consulte antes de responder; nunca responda de memória nem invente.',
    '- Chame a ferramenta assim que tiver os dados que ela pede. Não avise "vou verificar" sem chamar: chame e já responda com o resultado.',
    '- Se a resposta da ferramenta pedir um dado, pergunte ao cliente. Se disser que não conseguiu, peça desculpas, não diga que a ação foi feita e ofereça um atendente.',
    '- Repita datas, horários, valores, links e códigos exatamente como a ferramenta devolveu.',
    ...blocos.map((b) => `\n${b.join('\n')}`),
  ].join('\n')
}
