import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { withLock } from '@/lib/queue/distributed-lock'
import { enfileirarTurnoMaestro } from '@/lib/queue/queues'
import { isAiPausedNow } from '@/lib/ai/pause'
import { atualizarTurno, checarEnvioDaIA, registrarBloqueio, registrarTurno } from '@/lib/ai/turns'
import { MOTIVOS } from '@/lib/ai/motivos'
import { motivoIaNaoAtende } from '@/lib/ai/so-um-numero'
import { buildCapabilitiesPrompt, listCompanyTools, toFunctions } from '@/lib/ai-tools/registry'
import { executeTool } from '@/lib/ai-tools/executor'
import { calculateCost } from '@/lib/aiConfig'
import { resolverAgenteDaInbox, resolverChaveOpenAI, type AgenteIA } from './agente'
import { lerConfigMaestro, type ConfigMaestro } from './config'
import { esperaAgrupamentoSegundos } from './espera'
import {
  enviarPartes,
  indicarDigitando,
  quebrarResposta,
  type DestinoEnvio,
  type InboxEnvio,
} from './enviar'
import { falharParaHumano } from './fallback'
import {
  carregarLinhas,
  montarHistorico,
  temTranscricaoPendente,
  textoDaMensagem,
  type LinhaMensagem,
} from './historico'
import { conversar, ErroModelo, type ChamadaTool, type ResultadoConversa, type ResultadoFerramenta } from './llm'
import { montarSystemPrompt } from './prompt'

/**
 * Engine do Maestro: roda UM turno de atendimento numa conversa.
 *
 *   lock da conversa -> guardas -> registro do turno ('enviado') -> modelo <->
 *   ferramentas -> conferencia antes de enviar -> envio -> registro final
 *
 * Quem responde, o prompt, o modelo e as ferramentas vem do que o CRM ja tem
 * (AiAgent + src/lib/ai-tools); aqui so se orquestra. Toda decisao fica no
 * Registro da IA (AiTurn), com motivo fixo (ver MOTIVOS em src/lib/ai/motivos.ts).
 *
 * Garantias:
 *  - lock por conversa: dois turnos da mesma conversa nunca rodam juntos;
 *  - idempotencia: so responde se a ultima fala for do cliente;
 *  - antes de enviar (o modelo leva segundos) confere de novo pausa, encerramento,
 *    atendente e mensagem nova do cliente;
 *  - falha da IA (sem chave, OpenAI fora, resposta vazia) = mensagem curta ao
 *    cliente + conversa pra um atendente. Nunca silencio, nunca erro cru.
 */

// Turno longo (modelo ate ~90 s + envio) nao pode perder o lock no meio.
const TTL_LOCK_SEGUNDOS = 180
const REAGENDAR_LOCK_SEGUNDOS = 3
const REAGENDAR_TRANSCRICAO_SEGUNDOS = 5

export type StatusTurno = 'respondido' | 'ignorado' | 'erro' | 'descartado' | 'reagendado'

export interface EntradaTurno {
  companyId: string
  conversationId: string
  /** Id do AiTurn (uuid). Omitido = gera. E tambem o runId das ferramentas. */
  turnoId?: string
}

export interface ResultadoTurno {
  status: StatusTurno
  motivo: string | null
  respostas: string[]
  chamadas: number
  latenciaMs: number
  turnoId: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function resultado(
  status: StatusTurno,
  inicio: number,
  extra: Partial<Pick<ResultadoTurno, 'motivo' | 'respostas' | 'chamadas' | 'turnoId'>> = {}
): ResultadoTurno {
  return {
    status,
    motivo: extra.motivo ?? null,
    respostas: extra.respostas ?? [],
    chamadas: extra.chamadas ?? 0,
    latenciaMs: Date.now() - inicio,
    turnoId: extra.turnoId ?? null,
  }
}

// ─── Decisoes puras (testaveis sem banco) ───────────────────────────────────

export interface Pendentes {
  ids: string[]
  textos: string[]
  /** Hora da ultima mensagem do cliente considerada. */
  ultimaEm: Date
  ultimaId: string | null
}

/**
 * Mensagens do cliente que ainda nao foram respondidas: as ultimas do
 * historico, em sequencia, ate achar uma fala da IA/atendente. Mensagem de
 * sistema (lembrete) nao conta como fala. null = nada a responder (a ultima
 * fala nao e do cliente, ou o historico esta vazio): e o que faz um job
 * repetido nao responder duas vezes.
 */
export function pendentesDoCliente(linhas: LinhaMensagem[]): Pendentes | null {
  const falas = linhas.filter((m) => m.senderType !== 'system')
  const grupo: LinhaMensagem[] = []
  for (let i = falas.length - 1; i >= 0 && falas[i].senderType === 'client'; i--) grupo.unshift(falas[i])
  const comTexto = grupo.map((m) => ({ m, texto: textoDaMensagem(m) })).filter((x): x is { m: LinhaMensagem; texto: string } => Boolean(x.texto))
  if (comTexto.length === 0) return null
  const ultima = comTexto[comTexto.length - 1].m
  return {
    ids: comTexto.map((x) => x.m.id).filter((id): id is string => Boolean(id)),
    textos: comTexto.map((x) => x.texto),
    ultimaEm: ultima.createdAt,
    ultimaId: ultima.id ?? null,
  }
}

/** Motivo de nao responder, ou null se a conversa pode ser atendida pela IA. Ordem = prioridade. */
export function motivoDeNaoResponder(p: {
  agente: (Pick<AgenteIA, 'engine' | 'isActive'> & { onlyPhone?: string | null }) | null
  conversa: { status: string; transferredTo: string | null }
  temContato: boolean
  clientePausado: boolean
  /** Um atendente clicou "Retomar IA" depois do ultimo encaminhamento pra humano: a conversa voltou pra IA. */
  devolvidaParaIA?: boolean
  /** Telefone do cliente: com a IA ligada so para um numero, os outros ficam com a equipe. */
  telefoneCliente?: string | null
}): string | null {
  if (!p.agente || !p.agente.isActive) return MOTIVOS.MAESTRO_AGENTE_DESLIGADO
  if (motivoIaNaoAtende(p.agente, p.telefoneCliente)) return MOTIVOS.IA_SO_OUTRO_NUMERO
  if (p.agente.engine !== 'maestro') return MOTIVOS.MAESTRO_OUTRO_MOTOR
  if (p.conversa.status === 'closed') return MOTIVOS.MAESTRO_CONVERSA_ENCERRADA
  if ((p.conversa.transferredTo || p.conversa.status === 'pending') && !p.devolvidaParaIA) return MOTIVOS.MAESTRO_COM_ATENDENTE
  if (!p.temContato) return MOTIVOS.MAESTRO_SEM_CONTATO
  if (p.clientePausado) return MOTIVOS.IA_PAUSADA
  return null
}

/** Falha do modelo -> motivo fixo do Registro da IA. */
export function motivoDoErro(err: unknown): string {
  if (err instanceof ErroModelo) {
    if (err.codigo === 'sem_chave') return MOTIVOS.MAESTRO_SEM_CHAVE
    if (err.codigo === 'chave_recusada') return MOTIVOS.MAESTRO_CHAVE_RECUSADA
    if (err.codigo === 'sem_saldo') return MOTIVOS.MAESTRO_SEM_SALDO
    return MOTIVOS.MAESTRO_MODELO_FALHOU
  }
  return MOTIVOS.MAESTRO_ERRO_INTERNO
}

// ─── Entrada ────────────────────────────────────────────────────────────────

export async function processarTurno(entrada: EntradaTurno): Promise<ResultadoTurno> {
  const inicio = Date.now()
  const { companyId, conversationId } = entrada
  try {
    const r = await withLock(`maestro:${conversationId}`, TTL_LOCK_SEGUNDOS, () => turnoComLock(entrada, inicio))
    if (r.acquired) return r.result
  } catch (err) {
    // Redis fora no lock ou erro que escapou do turno: sem registro a mensagem
    // sumiria sem explicacao.
    console.error(`[maestro] turno da conversa ${conversationId} falhou:`, (err as Error)?.message)
    await registrarTurno({
      companyId,
      conversationId,
      messageIds: [],
      texto: null,
      status: 'erro',
      motivo: MOTIVOS.MAESTRO_ERRO_INTERNO,
      destino: 'maestro',
    })
    return resultado('erro', inicio, { motivo: MOTIVOS.MAESTRO_ERRO_INTERNO })
  }

  // Outro turno da mesma conversa em andamento: nao responde em paralelo. O que
  // chegou entra no proximo turno (reagenda). Sem registro: nao e uma decisao,
  // e uma espera, e o turno seguinte registra o desfecho de verdade.
  await enfileirarTurnoMaestro({ companyId, conversationId }, REAGENDAR_LOCK_SEGUNDOS).catch((err) => {
    console.error('[maestro] falha ao reagendar turno:', (err as Error)?.message)
  })
  return resultado('reagendado', inicio, { motivo: 'outro turno em andamento nesta conversa' })
}

// ─── Turno (dentro do lock) ─────────────────────────────────────────────────

async function turnoComLock(entrada: EntradaTurno, inicio: number): Promise<ResultadoTurno> {
  const { companyId, conversationId } = entrada

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, companyId },
    select: {
      id: true,
      status: true,
      transferredTo: true,
      friendlyId: true,
      clientId: true,
      company: { select: { name: true, tradeName: true } },
      client: {
        select: { id: true, firstName: true, lastName: true, fullName: true, phone: true, aiPaused: true, aiPausedUntil: true },
      },
      inbox: {
        select: {
          id: true,
          companyId: true,
          channelType: true,
          instanceName: true,
          displayName: true,
          phoneNumber: true,
          apiUrl: true,
          instanceApiKey: true,
          channelConfig: true,
          metadata: true,
          aiAgentId: true,
        },
      },
    },
  })
  if (!conv) {
    console.warn(`[maestro] conversa ${conversationId} nao encontrada para a empresa; turno ignorado`)
    return resultado('ignorado', inicio, { motivo: 'conversa nao encontrada' })
  }

  const linhas = await carregarLinhas(companyId, conversationId)

  // Idempotencia: so responde se a ultima fala for do cliente. Job repetido,
  // ou atrasado depois de um atendente responder, cai aqui (sem registro: nao
  // ha mensagem sem resposta pra explicar).
  const pendentes = pendentesDoCliente(linhas)
  if (!pendentes) {
    console.log(`[maestro] conversa ${conversationId}: sem mensagem nova do cliente; nada a responder`)
    return resultado('ignorado', inicio, { motivo: 'sem mensagem nova do cliente' })
  }

  // Audio ainda sendo transcrito: responder agora seria responder "[audio]".
  if (temTranscricaoPendente(linhas)) {
    await enfileirarTurnoMaestro({ companyId, conversationId }, REAGENDAR_TRANSCRICAO_SEGUNDOS).catch((err) => {
      console.error('[maestro] falha ao reagendar turno (transcricao):', (err as Error)?.message)
    })
    return resultado('reagendado', inicio, { motivo: 'aguardando transcricao do audio' })
  }

  const turnoId = entrada.turnoId && UUID_RE.test(entrada.turnoId) ? entrada.turnoId : randomUUID()
  const textoCliente = pendentes.textos.join('\n')

  const ignorar = async (motivo: string, extra: { pausadoAte?: Date | null } = {}): Promise<ResultadoTurno> => {
    const id = await registrarTurno({
      id: turnoId,
      companyId,
      conversationId,
      messageIds: pendentes.ids,
      texto: textoCliente,
      status: 'ignorado',
      motivo,
      destino: 'maestro',
      pausadoAte: extra.pausadoAte ?? null,
    })
    return resultado('ignorado', inicio, { motivo, turnoId: id })
  }

  // ── Guardas: em qualquer uma a IA fica quieta (alguem ou algo ja cuida).
  const agente = await resolverAgenteDaInbox(companyId, conv.inbox?.aiAgentId ?? null)
  const cliente = conv.client
  const comHumano = Boolean(conv.transferredTo) || conv.status === 'pending'
  const motivoGuarda = motivoDeNaoResponder({
    agente,
    conversa: conv,
    temContato: Boolean(cliente && cliente.phone && conv.inbox),
    clientePausado: isAiPausedNow(cliente),
    devolvidaParaIA: comHumano ? await devolvidaParaIA(companyId, conversationId) : false,
    telefoneCliente: cliente?.phone ?? null,
  })
  if (motivoGuarda || !agente || !cliente || !conv.inbox) {
    return ignorar(motivoGuarda ?? MOTIVOS.MAESTRO_SEM_CONTATO, {
      pausadoAte: motivoGuarda === MOTIVOS.IA_PAUSADA ? cliente?.aiPausedUntil ?? null : null,
    })
  }
  const telefone = cliente.phone as string

  // ── Vai preparar a resposta: o turno aparece no Registro como "aguardando".
  await registrarTurno({
    id: turnoId,
    companyId,
    conversationId,
    messageIds: pendentes.ids,
    texto: textoCliente,
    status: 'enviado',
    destino: 'maestro',
    aiStatus: 'active',
  })
  const inicioDoTurno = Date.now()

  const inbox: InboxEnvio = conv.inbox
  const destino: DestinoEnvio = {
    companyId,
    conversationId,
    inbox,
    para: telefone,
    // So a Cloud API usa (o "digitando" dela se prende na ultima mensagem do cliente).
    ultimaMensagemClienteId: inbox.channelType === 'whatsapp_cloud' ? await ultimoIdDoProvedor(conversationId, companyId) : null,
    turnoId,
  }
  const clienteNome = cliente.fullName || [cliente.firstName, cliente.lastName].filter(Boolean).join(' ') || null
  const config: ConfigMaestro = lerConfigMaestro(agente)

  // Antes de enviar (ou de desistir): o mundo mudou durante o turno?
  const conferir = () =>
    conferirAntesDeEnviar({
      companyId,
      conversationId,
      ultimaDoClienteEm: pendentes.ultimaEm,
      transferidoNoInicio: conv.transferredTo,
    })

  const falhar = async (motivo: string, opcoes: { avisar: boolean }): Promise<ResultadoTurno> => {
    await atualizarTurno(companyId, turnoId, { status: 'erro', motivo })
    // Falha com a conversa ja na mao de um atendente (pausou, assumiu, encerrou): nao ha
    // quem chamar nem o que avisar ao cliente (e nao pode tirar a conversa do atendente).
    // Cliente que escreveu de novo: o proximo turno tenta de novo (a falha pode ser passageira).
    const mudou = await conferir().catch(() => null)
    if (mudou) {
      if (mudou.tipo === 'mensagem_nova') await reagendarProximoTurno(companyId, conversationId)
      return resultado('erro', inicio, { motivo, turnoId })
    }
    const enviada = await falharParaHumano({
      companyId,
      conversationId,
      clientId: cliente.id,
      clientName: clienteNome,
      motivo,
      destino,
      mensagem: config.mensagemErro,
      avisar: opcoes.avisar,
    })
    return resultado('erro', inicio, { motivo, turnoId, respostas: enviada ? [enviada] : [] })
  }

  try {
    const apiKey = await resolverChaveOpenAI(agente, companyId)
    if (!apiKey) return await falhar(MOTIVOS.MAESTRO_SEM_CHAVE, { avisar: true })

    // Modo do WhatsApp (function calls ou servidor MCP) decide o que a IA recebe.
    const tools = await listCompanyTools(companyId, { agentId: agente.id })
    const system = montarSystemPrompt({
      config,
      empresaNome: conv.company.tradeName || conv.company.name,
      clienteNome,
      codigoConversa: conv.friendlyId,
      capacidades: buildCapabilitiesPrompt(tools),
    })

    // "Digitando..." enquanto a IA pensa (nunca derruba o turno).
    void indicarDigitando(destino, config.digitandoMs)

    let conversa: ResultadoConversa
    try {
      conversa = await conversar({
        apiKey,
        modelo: config.modelo,
        temperatura: config.temperatura,
        system,
        historico: montarHistorico(linhas),
        tools: toFunctions(tools),
        executar: (c) => executarFerramenta(c, { companyId, conversationId, turnoId }),
      })
    } catch (err) {
      console.error(`[maestro] conversa ${conversationId}: modelo falhou:`, (err as Error)?.message)
      return await falhar(motivoDoErro(err), { avisar: true })
    }

    await registrarUso({
      companyId,
      conversationId,
      clientId: cliente.id,
      messageId: pendentes.ultimaId,
      modelo: config.modelo,
      uso: conversa.uso,
      turnoId,
      voltas: conversa.voltas,
      ferramentas: conversa.chamadas.length,
    })

    // Transferiu pra humano e a IA nao escreveu a despedida: usa a frase padrao.
    const textoFinal = conversa.texto || (conversa.encerrou ? config.mensagemErro : '')
    const partes = quebrarResposta(textoFinal)
    if (partes.length === 0) return await falhar(MOTIVOS.MAESTRO_SEM_RESPOSTA, { avisar: true })

    // ── Conferencia antes de enviar: o modelo levou segundos e o mundo mudou.
    const barrada = await conferir()
    if (barrada) {
      if (barrada.tipo === 'pausa') {
        // Pausa: some em silencio e fica no Registro (resposta bloqueada), igual ao n8n.
        await registrarBloqueio(companyId, conversationId, barrada.ate)
        return resultado('ignorado', inicio, { motivo: MOTIVOS.RESPOSTA_BLOQUEADA, turnoId, chamadas: conversa.chamadas.length })
      }
      await atualizarTurno(companyId, turnoId, { status: 'ignorado', motivo: barrada.motivo })
      if (barrada.tipo === 'mensagem_nova') await reagendarProximoTurno(companyId, conversationId)
      return resultado(barrada.tipo === 'mensagem_nova' ? 'descartado' : 'ignorado', inicio, {
        motivo: barrada.motivo,
        turnoId,
        chamadas: conversa.chamadas.length,
      })
    }

    // ── Envio.
    const envio = await enviarPartes(destino, partes, {
      continuar: async () => (await conferir()) === null,
    })

    if (envio.erro) {
      console.error(`[maestro] conversa ${conversationId}: falha ao enviar:`, (envio.erro as Error)?.message)
      await atualizarTurno(companyId, turnoId, {
        status: 'erro',
        motivo: MOTIVOS.MAESTRO_ENVIO_FALHOU,
        resposta: envio.enviadas.length ? envio.enviadas.join('\n\n') : null,
      })
      // Canal fora: nem o aviso sairia. So passa pra um atendente.
      await falharParaHumano({
        companyId,
        conversationId,
        clientId: cliente.id,
        clientName: clienteNome,
        motivo: MOTIVOS.MAESTRO_ENVIO_FALHOU,
        destino: null,
        mensagem: '',
        avisar: false,
      })
      return resultado('erro', inicio, {
        motivo: MOTIVOS.MAESTRO_ENVIO_FALHOU,
        turnoId,
        respostas: envio.enviadas,
        chamadas: conversa.chamadas.length,
      })
    }

    const agora = new Date()
    await atualizarTurno(companyId, turnoId, {
      status: 'respondido',
      motivo: null,
      resposta: envio.enviadas.join('\n\n'),
      respondidoEm: agora,
      latencyMs: agora.getTime() - inicioDoTurno,
    })
    // A conversa passou a ter atendimento da IA (dashboard "atendidas pela IA").
    // A ferramenta de transferir deixa aiHandled=false de proposito: nao sobrescreve.
    if (!conversa.encerrou) {
      await prisma.conversation
        .updateMany({ where: { id: conversationId, companyId, aiHandled: false }, data: { aiHandled: true } })
        .catch(() => {})
    }
    console.log(
      `[maestro] conversa ${conversationId}: respondido (${envio.enviadas.length} msg, ${conversa.chamadas.length} ferramenta(s), ${Date.now() - inicio}ms)`
    )

    // Cliente que escreveu enquanto enviava: o job dele pode ter caido na
    // deduplicacao com este ainda rodando. Garante um turno pra ele.
    if (await existeMensagemNova(companyId, conversationId, pendentes.ultimaEm)) {
      await reagendarProximoTurno(companyId, conversationId)
    }
    return resultado('respondido', inicio, {
      turnoId,
      respostas: envio.enviadas,
      chamadas: conversa.chamadas.length,
    })
  } catch (err) {
    console.error(`[maestro] conversa ${conversationId}: erro inesperado:`, (err as Error)?.message)
    return falhar(MOTIVOS.MAESTRO_ERRO_INTERNO, { avisar: true }).catch(() =>
      resultado('erro', inicio, { motivo: MOTIVOS.MAESTRO_ERRO_INTERNO, turnoId })
    )
  }
}

// ─── Pecas do turno ─────────────────────────────────────────────────────────

/**
 * Executa a ferramenta pedida pelo modelo pelo executor do CRM: ele valida os
 * argumentos, completa restaurant_id/telefone a partir da conversa (o modelo
 * nunca escolhe), registra em AiToolCall e SEMPRE devolve texto pro modelo.
 */
async function executarFerramenta(
  c: ChamadaTool,
  ctx: { companyId: string; conversationId: string; turnoId: string }
): Promise<ResultadoFerramenta> {
  const r = await executeTool({
    companyId: ctx.companyId,
    conversationId: ctx.conversationId,
    name: c.nome,
    rawArgs: c.argsBrutos,
    runId: ctx.turnoId,
  })
  return { ok: r.ok, texto: r.result, encerra: c.nome === 'transferir_para_humano' && r.ok }
}

type Barrada =
  | { tipo: 'pausa'; ate: Date | null }
  | { tipo: 'mensagem_nova'; motivo: string }
  | { tipo: 'conversa'; motivo: string }

/**
 * Antes de CADA envio: a IA pode falar agora?
 *   - pausa (atendente respondeu, alguem pausou): usa a mesma trava do envio do
 *     n8n (checarEnvioDaIA), que ja deixa passar a despedida logo depois da
 *     propria ferramenta de transferir;
 *   - conversa encerrada ou assumida por um atendente no meio do turno;
 *   - cliente escreveu de novo: a resposta ficou velha; o turno novo responde tudo.
 */
async function conferirAntesDeEnviar(p: {
  companyId: string
  conversationId: string
  ultimaDoClienteEm: Date
  /** Atendente da conversa quando o turno comecou (null = ninguem). */
  transferidoNoInicio: string | null
}): Promise<Barrada | null> {
  const envio = await checarEnvioDaIA(p.companyId, p.conversationId)
  if (!envio.permitido) return { tipo: 'pausa', ate: envio.ate }

  const conv = await prisma.conversation.findFirst({
    where: { id: p.conversationId, companyId: p.companyId },
    select: { status: true, transferredTo: true },
  })
  if (!conv) return { tipo: 'conversa', motivo: MOTIVOS.MAESTRO_CONVERSA_ENCERRADA }
  if (conv.status === 'closed') return { tipo: 'conversa', motivo: MOTIVOS.MAESTRO_CONVERSA_ENCERRADA }
  // Atendente novo na conversa DURANTE o turno = assumiu. (status 'pending' sozinho pode ser a
  // propria ferramenta de transferir deste turno, que ainda precisa mandar a despedida; e um
  // atendente que ja era o dono no inicio so chegou aqui porque devolveram a conversa pra IA.)
  if (conv.transferredTo && conv.transferredTo !== p.transferidoNoInicio) {
    return { tipo: 'conversa', motivo: MOTIVOS.MAESTRO_COM_ATENDENTE }
  }

  if (await existeMensagemNova(p.companyId, p.conversationId, p.ultimaDoClienteEm)) {
    return { tipo: 'mensagem_nova', motivo: MOTIVOS.MAESTRO_RESPOSTA_DESCARTADA }
  }
  return null
}

/**
 * "Retomar IA" depois do ultimo encaminhamento pra humano = o atendente devolveu a
 * conversa. A tela de retomar so limpa a pausa do cliente; a conversa continua
 * 'pending' ou com transferredTo preenchido. Sem esta conferencia o Maestro ficaria
 * calado pra sempre em toda conversa que um dia foi pra um humano.
 * So e consultada quando a conversa esta com humano (caminho raro).
 */
async function devolvidaParaIA(companyId: string, conversationId: string): Promise<boolean> {
  try {
    const [retomada, encaminhada] = await Promise.all([
      prisma.conversationEvent.findFirst({
        where: { companyId, conversationId, type: 'ai_resumed' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      prisma.conversationEvent.findFirst({
        where: { companyId, conversationId, type: 'handoff_human' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
    if (!retomada) return false
    return !encaminhada || retomada.createdAt.getTime() > encaminhada.createdAt.getTime()
  } catch (err) {
    console.error('[maestro] falha ao conferir se a conversa foi devolvida pra IA:', (err as Error)?.message)
    return false
  }
}

async function existeMensagemNova(companyId: string, conversationId: string, depoisDe: Date): Promise<boolean> {
  const nova = await prisma.message.findFirst({
    where: { conversationId, conversation: { companyId }, senderType: 'client', createdAt: { gt: depoisDe } },
    select: { id: true },
  })
  return Boolean(nova)
}

async function reagendarProximoTurno(companyId: string, conversationId: string) {
  try {
    await enfileirarTurnoMaestro({ companyId, conversationId }, await esperaAgrupamentoSegundos(companyId))
  } catch (err) {
    console.error('[maestro] falha ao agendar o proximo turno:', (err as Error)?.message)
  }
}

/** Id do provedor da ultima mensagem do cliente (o "digitando" da Cloud API se prende nela). */
async function ultimoIdDoProvedor(conversationId: string, companyId: string): Promise<string | null> {
  try {
    const m = await prisma.message.findFirst({
      where: { conversationId, conversation: { companyId }, senderType: 'client', uazMessageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { uazMessageId: true },
    })
    return m?.uazMessageId ?? null
  } catch {
    return null
  }
}

/** Uso de tokens do turno em ai_token_usage (mesma tabela e tabela de custo do n8n). Nunca lanca. */
async function registrarUso(p: {
  companyId: string
  conversationId: string
  clientId: string
  messageId: string | null
  modelo: string
  uso: { entrada: number; saida: number }
  turnoId: string
  voltas: number
  ferramentas: number
}): Promise<void> {
  if (p.uso.entrada + p.uso.saida === 0) return
  try {
    const custo = calculateCost(p.modelo, p.uso.entrada, p.uso.saida)
    await prisma.aiTokenUsage.create({
      data: {
        companyId: p.companyId,
        conversationId: p.conversationId,
        clientId: p.clientId,
        messageId: p.messageId,
        provider: 'openai',
        model: p.modelo,
        requestType: 'maestro',
        inputTokens: p.uso.entrada,
        outputTokens: p.uso.saida,
        totalTokens: p.uso.entrada + p.uso.saida,
        inputCost: custo.inputCost,
        outputCost: custo.outputCost,
        totalCost: custo.totalCost,
        metadata: { turn_id: p.turnoId, model_calls: p.voltas, tool_calls: p.ferramentas },
      },
    })
  } catch (err) {
    console.error('[maestro] falha ao registrar uso de tokens:', (err as Error)?.message)
  }
}
