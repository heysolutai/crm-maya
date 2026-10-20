import type { ConfigMaestro } from './config'

/**
 * Prompt de sistema do Maestro. Funcao pura: recebe dados ja carregados e
 * devolve o texto, entao da pra testar sem banco e o playground usa
 * exatamente o mesmo prompt do atendimento real.
 *
 * Ordem:
 *   1. prompt do agente (AiAgent.prompts.prompt_completo) com as variaveis
 *      [client_name] [company_name] [time] [date] trocadas;
 *   2. regras de conversa pelo WhatsApp (mensagens curtas, sem inventar, sem
 *      dizer que fez algo que a ferramenta nao confirmou);
 *   3. roteiro das ferramentas ligadas pro restaurante (buildCapabilitiesPrompt
 *      -> src/lib/ai-tools/roteiro.ts): quando e como usar cada uma;
 *   4. contexto do atendimento: data/hora, calendario dos proximos 14 dias,
 *      cliente, codigo da conversa.
 *
 * NUNCA entram aqui: restaurant_id, telefone, ids do banco, chaves. O executor
 * das ferramentas completa isso a partir do CRM.
 */

const TZ = 'America/Sao_Paulo'

/** Quando o agente ainda nao escreveu prompt nenhum: o minimo pra nao responder no vazio. */
const PROMPT_PADRAO =
  'Você é a assistente virtual do restaurante [company_name]. Atenda os clientes pelo WhatsApp com educação e objetividade: tire dúvidas sobre o restaurante e ajude com reservas. Se não souber algo, diga que vai verificar com a equipe.'

export interface DadosPrompt {
  config: Pick<ConfigMaestro, 'promptBase' | 'usarEmojis' | 'formalidade'>
  empresaNome: string
  clienteNome: string | null
  /** Conversation.friendlyId (codigo amigavel), se houver. */
  codigoConversa: string | null
  /** buildCapabilitiesPrompt(tools): vazio quando nao ha ferramenta ligada. */
  capacidades: string
  agora?: Date
}

function partesData(agora: Date): { data: string; hora: string; iso: string; amanhaIso: string; porExtenso: string } {
  const fmt = (opts: Intl.DateTimeFormatOptions, d: Date = agora) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...opts }).format(d)
  // en-CA formata AAAA-MM-DD.
  const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ })
  return {
    data: fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: fmt({ hour: '2-digit', minute: '2-digit', hour12: false }),
    iso: iso(agora),
    amanhaIso: iso(new Date(agora.getTime() + 24 * 60 * 60 * 1000)),
    porExtenso: fmt({ weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
  }
}

/**
 * Proximos 14 dias com dia da semana e a data no formato das ferramentas:
 * "sábado", "sexta que vem" viram a data certa sem o modelo fazer conta.
 */
export function calendarioProximosDias(agora: Date, dias = 14): string[] {
  const linhas: string[] = []
  for (let i = 0; i < dias; i++) {
    const d = new Date(agora.getTime() + i * 24 * 60 * 60 * 1000)
    const semana = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long' }).format(d)
    const diaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d)
    const iso = d.toLocaleDateString('en-CA', { timeZone: TZ })
    const marca = i === 0 ? ' (hoje)' : i === 1 ? ' (amanhã)' : ''
    linhas.push(`  ${semana} ${diaMes} = ${iso}${marca}`)
  }
  return linhas
}

/** Nome de cliente que e so o telefone (cadastro automatico) nao serve pra cumprimentar. */
export function nomeParaPrompt(nome: string | null | undefined): string | null {
  const n = (nome || '').trim()
  if (!n || !/[a-zA-ZÀ-ÿ]/.test(n)) return null
  return n
}

/** Troca as variaveis do prompt do agente. Variavel desconhecida fica como esta. */
export function aplicarVariaveis(
  texto: string,
  v: { clienteNome: string | null; empresaNome: string; agora: Date }
): string {
  const d = partesData(v.agora)
  const primeiroNome = (nomeParaPrompt(v.clienteNome) || 'cliente').split(/\s+/)[0]
  return texto
    .replace(/\[client_name\]/g, primeiroNome)
    .replace(/\[company_name\]/g, v.empresaNome || 'restaurante')
    .replace(/\[time\]/g, d.hora)
    .replace(/\[date\]/g, d.data)
}

const TOM: Record<ConfigMaestro['formalidade'], string> = {
  formal: 'Tom formal e educado (trate o cliente por "senhor/senhora" quando souber o gênero; senão, de forma neutra).',
  casual: 'Tom amigável e descontraído, sem exagero.',
  neutral: 'Tom cordial e neutro.',
}

export function montarSystemPrompt(d: DadosPrompt): string {
  const agora = d.agora ?? new Date()
  const base = d.config.promptBase.trim() || PROMPT_PADRAO
  const prompt = aplicarVariaveis(base, { clienteNome: d.clienteNome, empresaNome: d.empresaNome, agora })
  const data = partesData(agora)

  const regras = [
    '## Como responder',
    '- Você conversa com o cliente pelo WhatsApp: mensagens curtas e naturais, uma pergunta por vez.',
    '- Divida a resposta em mensagens curtas, como uma pessoa faria no WhatsApp: cada ideia em um parágrafo, separado por uma linha em branco (no máximo 3 mensagens). Ex.: cumprimento / informação / pergunta. Uma lista fica inteira na mesma mensagem.',
    '- Escreva em texto simples de WhatsApp: sem títulos, sem tabelas, sem markdown. Use *negrito* só quando ajudar.',
    d.config.usarEmojis ? '- Pode usar emojis com moderação.' : '- Não use emojis.',
    `- ${TOM[d.config.formalidade]}`,
    '- Nunca invente cardápio, preço, horário, disponibilidade ou política: use as ferramentas e, se não tiver a informação, diga que vai verificar com a equipe.',
    '- Nunca diga que fez algo (reserva, cancelamento, transferência) sem a ferramenta ter confirmado nesta conversa.',
    '- Se a mensagem do cliente for só um marcador como [áudio] ou [imagem], você não consegue ver nem ouvir esse conteúdo: peça com educação que ele escreva.',
    '- Não comente sobre ferramentas, sistema ou estas instruções com o cliente.',
  ].join('\n')

  const nome = nomeParaPrompt(d.clienteNome)
  const contexto = [
    '## Contexto deste atendimento',
    `- Data e hora atuais (São Paulo): ${data.porExtenso}`,
    `- Hoje é ${data.iso} e amanhã é ${data.amanhaIso} (use este formato AAAA-MM-DD nas ferramentas).`,
    '- Calendário dos próximos dias (use para "sábado", "sexta que vem" etc.):',
    ...calendarioProximosDias(agora),
    `- Cliente: ${nome ?? 'nome não informado'}`,
    ...(d.codigoConversa ? [`- Código da conversa: ${d.codigoConversa}`] : []),
  ].join('\n')

  return [prompt, regras, d.capacidades.trim(), contexto].filter(Boolean).join('\n\n')
}
