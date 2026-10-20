import { prisma } from '@/lib/db'
import { enfileirarTurnoMaestro, enqueueN8NWebhook, type DestinoIA, type N8NWebhookJob } from '@/lib/queue/queues'
import { emFluxoExterno } from '@/lib/conversations/resume-url'
import { registrarTurno } from '@/lib/ai/turns'
import { MOTIVOS } from '@/lib/ai/motivos'
import { resolverAgenteDaConversa } from './agente'
import { esperaAgrupamentoSegundos } from './espera'

/**
 * Ponto UNICO por onde a mensagem do cliente chega na IA.
 *
 * Antes cada entrada (webhook do WhatsApp, Evolution, NotificaMe, workers de
 * audio e midia) chamava enqueueN8NWebhook direto. Com o Maestro a pergunta
 * "quem responde" depende do agente e da conversa; espalhar essa regra em
 * varios lugares era garantir que um ficasse pra tras (e a mensagem fosse
 * respondida por duas IAs). Os chamadores continuam donos das guardas deles
 * (eco da propria API, audio espera transcricao, midia espera upload) e do
 * payload do n8n; aqui so se decide o destino e se enfileira.
 *
 * Ordem de decisao (a primeira que casar vence):
 *   1. conversa sob fluxo externo (resumeUrl ativa ou janela do fluxo aberta,
 *      ex: avaliacao no n8n)                       -> n8n, como sempre foi
 *   2. agente da conversa e do Maestro e esta ativo -> turno do Maestro (NUNCA n8n junto)
 *   3. qualquer outro caso                          -> n8n, exatamente como antes
 * Pra agente 'n8n' (ou sem agente) o passo 1 nem chega a consultar o banco: o
 * resultado e sempre n8n e nenhum custo extra e adicionado ao caminho de hoje.
 *
 * Mensagem que NAO e do cliente (atendente respondendo, eco) nunca dispara
 * turno do Maestro; no n8n continua indo como historico, como sempre foi.
 */

export type DestinoDespacho = DestinoIA | 'nenhum'

/** Agente que quem chama ja resolveu (os webhooks ja buscam o agente da inbox). */
export interface AgenteDaMensagem {
  id: string
  engine: string
  /** Omitido = ativo (quem chama ja filtrou por ativos). */
  isActive?: boolean
}

export interface EntradaDecisao {
  companyId: string
  conversationId: string
  /**
   * Agente de IA da mensagem. undefined = resolve pela conversa (inbox ->
   * agente; senao o primeiro ativo). null = nao ha agente ativo (n8n).
   */
  agente?: AgenteDaMensagem | null
  /** Campos de fluxo externo da conversa, se quem chama ja leu. undefined = le aqui. */
  conversa?: { resumeUrl?: string | null; resumeUrlExpiresAt?: Date | null } | null
}

/**
 * A conversa esta (ou esteve ha pouco) sob um fluxo externo? Vale se ainda ha
 * resumeUrl nao vencida (fluxo esperando a resposta) OU se a janela do fluxo
 * ainda nao fechou (a url ja foi gasta, mas o fluxo ainda e dono da conversa).
 */
export function conversaEmFluxoExterno(
  c: { resumeUrl?: string | null; resumeUrlExpiresAt?: Date | null } | null | undefined
): boolean {
  if (!c) return false
  if (emFluxoExterno(c)) return true
  if (!c.resumeUrl) return false
  return !(c.resumeUrlExpiresAt && c.resumeUrlExpiresAt < new Date())
}

/** Quem vai responder esta mensagem: 'maestro' ou 'n8n'. Nao enfileira nada. */
export async function decidirDestinoIA(e: EntradaDecisao): Promise<DestinoIA> {
  let agente = e.agente
  if (agente === undefined) {
    try {
      const a = await resolverAgenteDaConversa(e.companyId, e.conversationId)
      agente = a ? { id: a.id, engine: a.engine, isActive: a.isActive } : null
    } catch (err) {
      // Banco fora na decisao: a mensagem NAO pode sumir. n8n e o caminho de antes do Maestro.
      console.error(`[despacho] falha ao ler o agente (conversa=${e.conversationId}); seguindo no n8n:`, (err as Error)?.message)
      return 'n8n'
    }
  }
  // Agente do Maestro DESLIGADO continua sendo do Maestro: o turno registra
  // "agente desligado" e nao responde. Mandar pro n8n faria o fluxo antigo
  // responder um numero que o restaurante desligou.
  if (!agente || agente.engine !== 'maestro') return 'n8n'

  let conversa = e.conversa
  if (conversa === undefined) {
    try {
      conversa = await prisma.conversation.findFirst({
        where: { id: e.conversationId, companyId: e.companyId },
        select: { resumeUrl: true, resumeUrlExpiresAt: true },
      })
    } catch (err) {
      // Sem saber se ha fluxo externo, o agente e do Maestro: o turno revalida as guardas.
      console.error(`[despacho] falha ao ler a conversa ${e.conversationId}:`, (err as Error)?.message)
      conversa = null
    }
  }
  return conversaEmFluxoExterno(conversa) ? 'n8n' : 'maestro'
}

/**
 * Falha ao ENFILEIRAR (Redis fora). Carrega o destino e a URL pra que quem tinha
 * fallback sincrono pro n8n continue podendo usa-lo. Turno do Maestro nao tem
 * fallback: mandar pro n8n faria duas IAs responderem a mesma conversa.
 */
export class ErroDespacho extends Error {
  readonly destino: DestinoIA
  /** URL que ia receber o payload (so n8n). */
  readonly webhookUrl: string | null
  readonly causa: unknown

  constructor(destino: DestinoIA, webhookUrl: string | null, causa: unknown) {
    super(`falha ao despachar mensagem (${destino})`)
    this.name = 'ErroDespacho'
    this.destino = destino
    this.webhookUrl = webhookUrl
    this.causa = causa
  }
}

export interface EntradaDespacho extends EntradaDecisao {
  messageId: string
  /** true = mensagem do cliente. false = enviada pela equipe/eco: nunca dispara turno do Maestro. */
  doCliente: boolean
  /** Destino ja decidido antes (audio/midia: decidido na entrada, executado no worker). */
  destino?: DestinoIA
  /** O que enfileirar se o destino for o n8n (null = nao ha fluxo n8n pra esta mensagem). */
  n8n?: { data: N8NWebhookJob; opts?: { debounceMs?: number } } | null
}

export async function despacharParaIA(e: EntradaDespacho): Promise<DestinoDespacho> {
  const destino = e.destino ?? (await decidirDestinoIA(e))

  if (destino === 'maestro') {
    // Atendente falando (ou eco): o Maestro responderia em cima do humano.
    if (!e.doCliente) {
      console.log(`[despacho] msg ${e.messageId} e de saida: Maestro nao aciona`)
      return 'nenhum'
    }
    try {
      await enfileirarTurnoMaestro(
        { companyId: e.companyId, conversationId: e.conversationId, messageId: e.messageId },
        await esperaAgrupamentoSegundos(e.companyId)
      )
    } catch (err) {
      await registrarTurno({
        companyId: e.companyId,
        conversationId: e.conversationId,
        messageIds: [e.messageId],
        texto: null,
        status: 'erro',
        motivo: MOTIVOS.MAESTRO_FALHA_FILA,
        destino: 'maestro',
      })
      throw new ErroDespacho('maestro', null, err)
    }
    return 'maestro'
  }

  // n8n: exatamente como antes (mesmo job, mesmas opcoes de debounce).
  if (!e.n8n) return 'nenhum'
  try {
    await enqueueN8NWebhook(e.n8n.data, e.n8n.opts)
  } catch (err) {
    throw new ErroDespacho('n8n', e.n8n.data.webhookUrl || null, err)
  }
  return 'n8n'
}
