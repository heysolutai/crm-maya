import type { HandoffNotify, Inbox } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getAdapter } from '@/lib/channels/registry'
import { ChannelError } from '@/lib/channels/errors'
import { sendCloudTemplate } from '@/lib/channels/adapters/whatsapp-cloud'
import { paraChannelAgent } from '@/lib/maestro/enviar'
import { getRedisConnection } from '@/lib/queue/connection'
import { mesmoTelefone, numerosDoTeste } from '@/lib/ai/so-um-numero'
import { ehFunil, type Funil } from './funis'
import { textoDoAviso, variaveisDoTemplate, type ConteudoAviso } from './aviso-texto'

/**
 * Aviso no WhatsApp da equipe quando chega uma solicitacao nova.
 *
 * Sai por uma conexao do restaurante: UAZAPI (e afins) manda texto livre; a
 * API oficial so pode iniciar conversa com template aprovado (4 variaveis, na
 * ordem: funil › categoria, cliente, resumo, link).
 *
 * Dois cuidados:
 *  - o eco do proprio aviso nao vira conversa no CRM (o id enviado fica no
 *    Redis e o webhook ignora);
 *  - o numero da equipe nao e atendido pela IA (ehNumeroDaEquipe).
 */

const ECO_TTL_S = 60 * 60
const chaveEco = (id: string) => `aviso-equipe:eco:${id}`

/** Id curto do provedor (sem o "numero:" na frente). */
function idCurto(id: string): string {
  return id.split(':').pop() || id
}

async function guardarEco(providerMessageId: string): Promise<void> {
  if (!providerMessageId) return
  try {
    const redis = getRedisConnection()
    await redis.set(chaveEco(idCurto(providerMessageId)), '1', 'EX', ECO_TTL_S)
  } catch (err) {
    console.warn('[avisos] nao guardou o id do aviso:', (err as Error)?.message)
  }
}

/** A mensagem enviada (eco do webhook) e um aviso nosso para a equipe? */
export async function ehEcoDeAviso(providerMessageId: string | null | undefined): Promise<boolean> {
  if (!providerMessageId) return false
  try {
    return (await getRedisConnection().exists(chaveEco(idCurto(providerMessageId)))) === 1
  } catch {
    return false
  }
}

// ─── Numeros da equipe (cache curto: o webhook pergunta a cada mensagem) ────

const CACHE_MS = 60_000
const cacheEquipe = new Map<string, { numeros: string[]; ate: number }>()

/** Todos os numeros da equipe cadastrados nos avisos (funis + categorias). */
export async function numerosDaEquipe(companyId: string): Promise<string[]> {
  const agora = Date.now()
  const c = cacheEquipe.get(companyId)
  if (c && c.ate > agora) return c.numeros
  const [avisos, regras] = await Promise.all([
    prisma.handoffNotify.findMany({ where: { companyId }, select: { phones: true } }),
    prisma.handoffRule.findMany({ where: { companyId, notifyPhones: { isEmpty: false } }, select: { notifyPhones: true } }),
  ])
  const numeros = [...new Set([...avisos.flatMap((a) => a.phones), ...regras.flatMap((r) => r.notifyPhones)])]
  cacheEquipe.set(companyId, { numeros, ate: agora + CACHE_MS })
  return numeros
}

export function limparCacheEquipe(companyId: string): void {
  cacheEquipe.delete(companyId)
}

/**
 * O cliente e alguem da equipe (recebe os avisos)? Entao a IA nao atende: se o
 * gerente responder o aviso, a IA nao conversa com ele como cliente. Excecao:
 * o numero esta na lista de teste da IA (teste explicito ganha).
 */
export async function ehNumeroDaEquipe(companyId: string, telefone: string | null | undefined, onlyPhone?: string | null): Promise<boolean> {
  if (!telefone) return false
  try {
    if (numerosDoTeste(onlyPhone).some((n) => mesmoTelefone(n, telefone))) return false
    return (await numerosDaEquipe(companyId)).some((n) => mesmoTelefone(n, telefone))
  } catch (err) {
    console.warn('[avisos] nao conferiu numero da equipe:', (err as Error)?.message)
    return false
  }
}

// ─── Texto e envio ──────────────────────────────────────────────────────────

function telefoneBR(digitos: string | null | undefined): string {
  if (!digitos) return ''
  const d0 = digitos.replace(/\D/g, '')
  const d = d0.length >= 12 && d0.startsWith('55') ? d0.slice(2) : d0
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return digitos
}

/** "2026-12-12" -> "12/12/2026"; o resto como veio. */
function valorLegivel(v: string | number): string {
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split('-').reverse().join('/') : s
}

function linkDoCard(funil: Funil, id: string | null): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '')
  const caminho = `/app/crm?funil=${funil}${id ? `&abrir=${id}` : ''}`
  return base ? `${base}${caminho}` : caminho
}

export { TEMPLATE_SUGERIDO, textoDoAviso, variaveisDoTemplate, type ConteudoAviso } from './aviso-texto'

type InboxAviso = Pick<
  Inbox,
  'id' | 'companyId' | 'channelType' | 'instanceName' | 'displayName' | 'phoneNumber' | 'apiUrl' | 'instanceApiKey' | 'channelConfig' | 'metadata' | 'isActive'
>

const SELECT_INBOX = {
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
  isActive: true,
} as const

/**
 * Conexao que envia: a escolhida no aviso; senao a da conversa do cliente;
 * senao a primeira ativa. Espelho nunca (somente leitura).
 */
async function conexaoDeEnvio(companyId: string, escolhida: string | null, daConversa: string | null): Promise<InboxAviso | null> {
  for (const id of [escolhida, daConversa]) {
    if (!id) continue
    const inbox = await prisma.inbox.findFirst({
      where: { id, companyId, isActive: true, channelType: { not: 'espelho' } },
      select: SELECT_INBOX,
    })
    if (inbox) return inbox
  }
  return prisma.inbox.findFirst({
    where: { companyId, isActive: true, channelType: { not: 'espelho' } },
    orderBy: { createdAt: 'asc' },
    select: SELECT_INBOX,
  })
}

/** Motivo da falha de envio para quem le o card (sem detalhe interno). */
function motivoDaFalha(err: unknown): string {
  const codigo = err instanceof ChannelError ? err.code : null
  switch (codigo) {
    case 'INVALID_CREDENTIALS':
      return 'a conexão recusou o acesso; confira se ela está conectada'
    case 'INSTANCE_NOT_FOUND':
      return 'a conexão não existe mais no provedor'
    case 'PROVIDER_UNREACHABLE':
    case 'NETWORK_ERROR':
      return 'o WhatsApp da conexão está fora do ar'
    case 'RATE_LIMITED':
      return 'o provedor pediu para esperar um pouco'
    case 'BAD_REQUEST':
      return 'o provedor recusou a mensagem (confira o número e, na API oficial, o template)'
    default:
      return 'o provedor não aceitou o envio'
  }
}

export interface ResultadoAviso {
  enviados: string[]
  falhas: { numero: string; erro: string }[]
  /** Motivo de nao ter tentado (sem numero, sem conexao, falta template...). */
  naoEnviado?: string
}

/** Envia o aviso para os numeros. Nunca lanca. */
export async function enviarAviso(
  config: Pick<HandoffNotify, 'inboxId' | 'templateName' | 'templateLanguage'>,
  companyId: string,
  numeros: string[],
  conteudo: ConteudoAviso,
  conexaoDaConversa: string | null
): Promise<ResultadoAviso> {
  // O provedor precisa do codigo do pais: "(41) 99867-9696" sai como 5541998679696.
  const comPais = (n: string) => (n.length <= 11 ? `55${n}` : n)
  const destino = [...new Set(numeros.map((n) => n.replace(/\D/g, '')).filter((n) => n.length >= 10).map(comPais))]
  if (!destino.length) return { enviados: [], falhas: [], naoEnviado: 'nenhum número da equipe cadastrado' }

  let inbox: InboxAviso | null
  try {
    inbox = await conexaoDeEnvio(companyId, config.inboxId, conexaoDaConversa)
  } catch (err) {
    console.error('[avisos] falha ao achar a conexao:', (err as Error)?.message)
    return { enviados: [], falhas: [], naoEnviado: 'não foi possível achar a conexão de envio' }
  }
  const agent = inbox ? paraChannelAgent(inbox) : null
  if (!inbox || !agent) return { enviados: [], falhas: [], naoEnviado: 'nenhuma conexão de WhatsApp disponível para enviar' }

  const oficial = inbox.channelType === 'whatsapp_cloud'
  if (oficial && !config.templateName) {
    return { enviados: [], falhas: [], naoEnviado: 'a conexão é da API oficial e precisa de um template aprovado' }
  }

  const resultado: ResultadoAviso = { enviados: [], falhas: [] }
  for (const numero of destino) {
    try {
      const r = oficial
        ? await sendCloudTemplate(agent, {
            to: numero,
            name: config.templateName as string,
            language: config.templateLanguage || 'pt_BR',
            params: variaveisDoTemplate(conteudo),
          })
        : await getAdapter(agent.channelType).sendText(agent, { to: numero, text: textoDoAviso(conteudo) })
      await guardarEco(r.providerMessageId)
      resultado.enviados.push(numero)
    } catch (err) {
      // Detalhe tecnico so no log; o card mostra o motivo em palavras simples.
      console.error(`[avisos] falha ao avisar ${numero}:`, err instanceof Error ? err.message : err)
      resultado.falhas.push({ numero, erro: motivoDaFalha(err) })
    }
  }
  return resultado
}

/** Resultado em palavras para o card ("Enviado para (41) 99867-9696"). */
export function resultadoEmTexto(r: ResultadoAviso): string {
  if (r.naoEnviado) return `Aviso não enviado: ${r.naoEnviado}.`
  const ok = r.enviados.map(telefoneBR)
  const falhou = r.falhas.map((f) => telefoneBR(f.numero))
  if (!falhou.length) return `Aviso enviado para ${ok.join(', ')}.`
  if (!ok.length) return `Aviso falhou para ${falhou.join(', ')}. Confira a conexão de envio${r.falhas[0] ? ` (${r.falhas[0].erro})` : ''}.`
  return `Aviso enviado para ${ok.join(', ')}; falhou para ${falhou.join(', ')}.`
}

/**
 * Avisa a equipe de uma solicitacao nova, conforme o aviso do funil e os
 * numeros extras da categoria. Grava o resultado no card. Nunca lanca: aviso
 * nao pode derrubar a solicitacao nem a resposta da IA.
 */
export async function avisarEquipe(solicitacaoId: string): Promise<void> {
  try {
    const s = await prisma.handoffRequest.findUnique({
      where: { id: solicitacaoId },
      select: {
        id: true,
        companyId: true,
        funnel: true,
        category: true,
        customerName: true,
        customerPhone: true,
        summary: true,
        data: true,
        conversation: { select: { inboxId: true } },
        rule: { select: { notifyPhones: true } },
      },
    })
    if (!s || !ehFunil(s.funnel)) return
    const config = await prisma.handoffNotify.findUnique({ where: { companyId_funnel: { companyId: s.companyId, funnel: s.funnel } } })
    if (!config?.enabled) return

    const numeros = [...config.phones, ...(s.rule?.notifyPhones ?? [])]
    const brutos = s.data && typeof s.data === 'object' && !Array.isArray(s.data) ? (s.data as Record<string, string | number>) : {}
    const conteudo: ConteudoAviso = {
      funil: s.funnel,
      categoria: s.category,
      clienteNome: s.customerName || 'Cliente',
      clienteTelefone: telefoneBR(s.customerPhone),
      resumo: s.summary || '',
      dados: Object.entries(brutos)
        .filter(([, v]) => v !== '' && v != null)
        .map(([k, v]): [string, string] => [k, valorLegivel(v)]),
      link: linkDoCard(s.funnel, s.id),
    }
    const r = await enviarAviso(config, s.companyId, numeros, conteudo, s.conversation?.inboxId ?? null)
    await prisma.handoffRequest.update({
      where: { id: s.id },
      data: { notifiedAt: r.enviados.length ? new Date() : null, notifyResult: resultadoEmTexto(r).slice(0, 500) },
    })
  } catch (err) {
    console.error('[avisos] falha ao avisar a equipe:', (err as Error)?.message)
  }
}

/** Aviso de teste (botao "Enviar teste" nas regras). */
export async function enviarAvisoDeTeste(
  companyId: string,
  funil: Funil,
  config: Pick<HandoffNotify, 'inboxId' | 'templateName' | 'templateLanguage' | 'phones'>
): Promise<ResultadoAviso> {
  return enviarAviso(
    config,
    companyId,
    config.phones,
    {
      funil,
      categoria: 'Teste do aviso',
      clienteNome: 'Cliente de teste',
      clienteTelefone: '(41) 99999-0000',
      resumo: 'Este é um aviso de teste do CRM. Se chegou, está tudo certo.',
      dados: [],
      link: linkDoCard(funil, null),
    },
    null
  )
}
