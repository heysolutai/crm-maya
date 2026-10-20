import type { Inbox } from '@prisma/client'
import { prisma } from '@/lib/db'
import { saveMessage } from '@/lib/api/database'
import { marcarFalhaEnvio } from '@/lib/api/whatsapp'
import { getAdapter, hasAdapter } from '@/lib/channels/registry'
import { isChannelType } from '@/lib/channels/types'
import type { ChannelAgent } from '@/lib/channels/adapter'
import { sendCloudTyping } from '@/lib/channels/adapters/whatsapp-cloud'
import { isInsideCloudWindow } from '@/lib/channels/cloud-window'
import { prepararTextoParaWhatsApp } from '@/lib/whatsapp/texto-whatsapp'

/**
 * Envio da resposta da IA pelo canal da inbox da conversa.
 *
 * Espelha o ramo de adapter de POST /api/whatsapp/send-text (sem refatorar a
 * rota): grava a mensagem ANTES de enviar (o webhook de eco so deduplica se a
 * mensagem ja existir), manda pelo adapter do canal e guarda o id do provedor
 * em Message.uazMessageId. A pausa da IA NAO e checada aqui: quem chama
 * (engine) confere antes de cada envio.
 *
 * Resposta longa vira ate 3 mensagens curtas, com uma pausa "humana" entre
 * elas. "Digitando..." e opcional e nunca derruba o turno.
 */

export type InboxEnvio = Pick<
  Inbox,
  | 'id'
  | 'companyId'
  | 'channelType'
  | 'instanceName'
  | 'displayName'
  | 'phoneNumber'
  | 'apiUrl'
  | 'instanceApiKey'
  | 'channelConfig'
  | 'metadata'
>

export interface DestinoEnvio {
  companyId: string
  conversationId: string
  inbox: InboxEnvio
  /** Telefone do cliente. */
  para: string
  /** Id do provedor da ultima mensagem do cliente (o "digitando" da Cloud API se prende nela). */
  ultimaMensagemClienteId?: string | null
  /** Turno do Maestro (vai no metadata da mensagem, pra rastrear). */
  turnoId?: string
}

export const MAX_PARTES = 3
const LIMITE_PARTE_LONGA = 320
const MS_POR_CARACTERE = 25
const ATRASO_MAX_MS = 4_000

// ─── Quebra da resposta em mensagens curtas ─────────────────────────────────

function comoRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

const ABREVIACOES = /^(sr|sra|srta|dr|dra|av|obs|tel|ex|etc)\.$/i

/** Posicoes (offset no texto) onde uma frase termina e outra comeca. */
function posicoesDeCorte(texto: string): number[] {
  const cortes: number[] = []
  const re = /[.!?…]+["')\]]*\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(texto)) !== null) {
    const fim = m.index + m[0].length
    if (fim >= texto.length) continue
    const ate = texto.slice(0, m.index + m[0].trimEnd().length)
    const palavra = ate.slice(Math.max(0, ate.search(/\S+$/)))
    // "1." de lista numerada e "Sr." nao encerram frase.
    if (/^\d+[.)]$/.test(palavra) || ABREVIACOES.test(palavra)) continue
    cortes.push(fim)
  }
  return cortes
}

/** Parte um texto longo em dois, na fronteira de frase mais perto do meio. */
function partirNoMeio(texto: string): [string, string] | null {
  const cortes = posicoesDeCorte(texto)
  if (cortes.length === 0) return null
  const meio = texto.length / 2
  let melhor = cortes[0]
  for (const c of cortes) if (Math.abs(c - meio) < Math.abs(melhor - meio)) melhor = c
  const a = texto.slice(0, melhor).trim()
  const b = texto.slice(melhor).trim()
  return a && b ? [a, b] : null
}

/**
 * Markdown -> WhatsApp e quebra em ate `max` mensagens curtas:
 *  1. por linha em branco (cada paragrafo e uma mensagem);
 *  2. passou de `max`: junta os vizinhos menores ate caber;
 *  3. sobrou espaco e ha paragrafo longo: parte na fronteira de frase.
 * Nada do texto se perde.
 */
export function quebrarResposta(texto: string, max: number = MAX_PARTES): string[] {
  const t = prepararTextoParaWhatsApp(texto || '').trim()
  if (!t) return []
  let partes = t
    .split(/\n[ \t]*\n+/)
    .map((s) => s.trim())
    .filter(Boolean)

  while (partes.length > max) {
    let melhor = 0
    let menor = Number.POSITIVE_INFINITY
    for (let i = 0; i < partes.length - 1; i++) {
      const tam = partes[i].length + partes[i + 1].length
      if (tam < menor) {
        menor = tam
        melhor = i
      }
    }
    partes = [...partes.slice(0, melhor), `${partes[melhor]}\n\n${partes[melhor + 1]}`, ...partes.slice(melhor + 2)]
  }

  while (partes.length < max) {
    let idx = -1
    for (let i = 0; i < partes.length; i++) {
      if (partes[i].length > LIMITE_PARTE_LONGA && (idx === -1 || partes[i].length > partes[idx].length)) idx = i
    }
    if (idx === -1) break
    const dois = partirNoMeio(partes[idx])
    if (!dois) break
    partes = [...partes.slice(0, idx), dois[0], dois[1], ...partes.slice(idx + 1)]
  }
  return partes
}

/** Pausa antes de uma mensagem: o que uma pessoa levaria digitando (~25 ms por caractere, no maximo 4 s). */
export function atrasoEntreMensagens(texto: string): number {
  return Math.min(ATRASO_MAX_MS, Math.max(0, texto.length * MS_POR_CARACTERE))
}

// ─── Canal ──────────────────────────────────────────────────────────────────

export function paraChannelAgent(inbox: InboxEnvio): ChannelAgent | null {
  if (!isChannelType(inbox.channelType) || !hasAdapter(inbox.channelType)) return null
  return {
    id: inbox.id,
    companyId: inbox.companyId,
    channelType: inbox.channelType,
    instanceName: inbox.instanceName,
    displayName: inbox.displayName,
    phoneNumber: inbox.phoneNumber,
    apiUrl: inbox.apiUrl,
    instanceApiKey: inbox.instanceApiKey,
    channelConfig: inbox.channelConfig && typeof inbox.channelConfig === 'object' && !Array.isArray(inbox.channelConfig)
      ? (inbox.channelConfig as Record<string, unknown>)
      : null,
    metadata: inbox.metadata && typeof inbox.metadata === 'object' && !Array.isArray(inbox.metadata)
      ? (inbox.metadata as Record<string, unknown>)
      : null,
  }
}

/**
 * "Digitando..." pelo tempo dado. Nunca lanca e nao precisa de await: ha
 * provedor que segura a requisicao pela duracao inteira.
 *   - uazapi: POST {apiUrl}/message/presence (mesma chamada do worker do n8n);
 *   - whatsapp_cloud: preso na ultima mensagem do cliente (tambem marca como lida);
 *   - demais canais: sem indicador.
 */
export async function indicarDigitando(destino: DestinoEnvio, ms: number): Promise<void> {
  if (ms <= 0) return
  const { inbox } = destino
  try {
    if (inbox.channelType === 'uazapi' && inbox.apiUrl && inbox.instanceApiKey) {
      await fetch(`${inbox.apiUrl}/message/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: inbox.instanceApiKey },
        body: JSON.stringify({ number: destino.para.replace(/\D/g, ''), presence: 'composing', delay: ms }),
        signal: AbortSignal.timeout(Math.min(ms, 30_000) + 5_000),
      })
    } else if (inbox.channelType === 'whatsapp_cloud') {
      const phoneNumberId = comoRecord(inbox.channelConfig).phoneNumberId
      if (typeof phoneNumberId === 'string' && phoneNumberId && destino.ultimaMensagemClienteId) {
        await sendCloudTyping(phoneNumberId, destino.ultimaMensagemClienteId)
      }
    }
  } catch (err) {
    console.warn('[maestro] indicador de digitando falhou:', (err as Error)?.message)
  }
}

/**
 * Grava e envia UM texto. Lanca se o canal falhar (quem chama decide o que
 * fazer); a mensagem gravada fica marcada como falha (readStatus 'failed' +
 * send_error) pra tela mostrar e oferecer "Tentar de novo".
 */
export async function enviarTexto(destino: DestinoEnvio, textoBruto: string): Promise<{ messageId: string }> {
  const agent = paraChannelAgent(destino.inbox)
  if (!agent) throw new Error(`canal sem adapter: ${destino.inbox.channelType}`)
  // Mesmo texto que a tela e o WhatsApp vao mostrar (markdown/\n literal ja tratados).
  const texto = prepararTextoParaWhatsApp(textoBruto)

  const msg = await saveMessage(destino.conversationId, texto, 'text', true, null, undefined, {
    maestro: true,
    channel: destino.inbox.channelType,
    ...(destino.turnoId ? { turn_id: destino.turnoId } : {}),
  })

  try {
    const r = await getAdapter(agent.channelType).sendText(agent, { to: destino.para, text: texto })
    if (r.providerMessageId) {
      // Id do provedor pra dedup do webhook de eco (falha aqui nao invalida o envio).
      await prisma.message
        .update({ where: { id: msg.id }, data: { uazMessageId: r.providerMessageId } })
        .catch(() => {})
    }
  } catch (err) {
    // readStatus 'failed' + send_error mesclado + aviso pra tela (nunca lanca).
    await marcarFalhaEnvio(msg.id, err, { companyId: destino.companyId })
    throw err
  }
  return { messageId: msg.id }
}

export interface OpcoesEnvio {
  /** Dorme entre as mensagens (injetavel pra teste). */
  esperar?: (ms: number) => Promise<void>
  /** Chamado antes de CADA mensagem depois da primeira: false = para de enviar (pausa, cliente escreveu de novo). */
  continuar?: () => Promise<boolean>
}

export interface ResultadoEnvio {
  enviadas: string[]
  /** Erro do canal na mensagem que falhou (as anteriores ja sairam). */
  erro: unknown
  /** Parou porque `continuar` devolveu false. */
  interrompida: boolean
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Manda as partes em ordem, com "digitando..." e pausa entre elas. */
export async function enviarPartes(destino: DestinoEnvio, partes: string[], opcoes: OpcoesEnvio = {}): Promise<ResultadoEnvio> {
  const esperar = opcoes.esperar ?? dormir
  const enviadas: string[] = []

  // WhatsApp Cloud: texto livre so ate 24h da ultima mensagem do cliente. Resposta
  // a uma mensagem recem-chegada sempre cabe; a checagem so evita um erro feio da Meta.
  if (destino.inbox.channelType === 'whatsapp_cloud' && !(await isInsideCloudWindow(destino.conversationId))) {
    return { enviadas, erro: new Error('fora da janela de 24h do WhatsApp Cloud'), interrompida: false }
  }

  for (let i = 0; i < partes.length; i++) {
    if (i > 0) {
      const ms = atrasoEntreMensagens(partes[i])
      void indicarDigitando(destino, ms)
      await esperar(ms)
      if (opcoes.continuar && !(await opcoes.continuar())) {
        return { enviadas, erro: null, interrompida: true }
      }
    }
    try {
      await enviarTexto(destino, partes[i])
      enviadas.push(partes[i])
    } catch (erro) {
      return { enviadas, erro, interrompida: false }
    }
  }
  return { enviadas, erro: null, interrompida: false }
}
