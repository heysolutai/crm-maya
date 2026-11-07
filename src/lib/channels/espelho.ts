import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { assertSafeUrl } from '@/lib/ai-tools/http'

/**
 * Conexao "Espelho (somente leitura)": outro sistema (ex.: Hermes, com o
 * WhatsApp oficial) manda uma COPIA de cada mensagem, recebida ou enviada, e
 * o CRM so registra. Nunca envia por essa conexao.
 *
 * Contrato (POST /api/webhooks/espelho/<id-da-conexao>):
 *   Cabecalho X-Assinatura = HMAC-SHA256 (hex minusculo) do corpo BRUTO com a
 *   chave da conexao. Corpo: { evento: "mensagem" | "status", ... } (ver os
 *   schemas abaixo).
 *
 * A mensagem e traduzida pro mesmo formato interno da UazAPI e entra na MESMA
 * fila/pipeline (cliente, conversa, midia, tempo real), como a Covercut faz.
 */

/** Mensagem com `data` mais antiga que isso e historico: entra sem notificar a equipe. */
export const ESPELHO_HISTORICO_MS = 10 * 60 * 1000

const MAX_MIDIA_BYTES = 25 * 1024 * 1024

export const mensagemEspelhoSchema = z.object({
  evento: z.literal('mensagem').optional(),
  direcao: z.enum(['recebida', 'enviada']),
  id: z.string().min(1).max(200),
  telefone_cliente: z.string().min(8).max(25),
  nome_cliente: z.string().max(200).nullish(),
  tipo: z.string().max(30).default('text'),
  texto: z.string().max(10000).nullish(),
  midia_url: z.string().url().max(2000).nullish(),
  midia_tipo: z.string().max(100).nullish(),
  enviado_por: z.string().max(30).nullish(),
  nome_atendente: z.string().max(100).nullish(),
  data: z.string().max(40).nullish(),
  // Extras do sistema de origem: gravados no metadata (uso futuro).
  origem: z.string().max(30).nullish(),
  botoes: z.array(z.string().max(500)).max(20).nullish(),
  etapa: z.string().max(60).nullish(),
})

export const statusEspelhoSchema = z.object({
  evento: z.literal('status'),
  id: z.string().min(1).max(200),
  status: z.string().max(20),
})

export type MensagemEspelho = z.infer<typeof mensagemEspelhoSchema>

/** Dados do espelho que viajam junto do payload ate o pipeline (rawPayload.espelho). */
export interface EspelhoNoPayload {
  /** Nome mostrado nas enviadas ("Via Maya (funil)"). */
  origem_externa?: string
  /** Horario real da mensagem (ISO), pra ordem e pro historico. */
  data?: string
  enviado_por?: string
  origem?: string
  botoes?: string[]
  etapa?: string
}

export function gerarChaveEspelho(): string {
  return randomBytes(32).toString('hex')
}

/** Nome interno da conexao: aleatorio, pra ninguem adivinhar e postar no webhook da UazAPI. */
export function espelhoInstanceName(): string {
  return `espelho-${randomBytes(16).toString('hex')}`
}

/** X-Assinatura = HMAC-SHA256 hex dos BYTES exatos do corpo. Comparacao timing-safe. */
export function assinaturaEspelhoValida(corpoBruto: Buffer, assinatura: string, chave: string): boolean {
  const esperado = Buffer.from(createHmac('sha256', chave).update(corpoBruto).digest('hex'))
  const recebido = Buffer.from(assinatura.trim().toLowerCase())
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado)
}

/** Horario da mensagem: so aceita data valida e nao muito no futuro. */
export function dataDaMensagem(data: string | null | undefined): Date | null {
  if (!data) return null
  const d = new Date(data)
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60 * 1000) return null
  return d
}

/**
 * Id usado pra deduplicar. Mensagens antigas sem wamid vem como "hist_<...>":
 * mistura com telefone/horario/conteudo pra nao juntar mensagens diferentes
 * (e o mesmo reenvio continua caindo no mesmo id).
 */
function idDaMensagem(m: MensagemEspelho): string {
  if (!m.id.startsWith('hist_')) return m.id
  const base = [m.id, m.telefone_cliente, m.data, m.direcao, m.texto, m.midia_url].join('|')
  return `hist_${createHash('sha1').update(base).digest('hex').slice(0, 24)}`
}

const MEDIA_REF_PREFIX = 'espelho-media://'

const UAZ_MESSAGE_TYPE: Record<string, string> = {
  image: 'ImageMessage',
  video: 'VideoMessage',
  audio: 'AudioMessage',
  ptt: 'PttMessage',
  document: 'DocumentMessage',
  sticker: 'StickerMessage',
}

export function isEspelhoMediaRef(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(MEDIA_REF_PREFIX)
}

/**
 * Baixa a midia do link publico do sistema de origem (ele expira: guardamos
 * a copia). So https publico, com limite de tamanho e tempo.
 */
export async function downloadEspelhoMedia(
  ref: string
): Promise<{ buffer: Buffer; mimeType: string; fileName?: string } | null> {
  if (!isEspelhoMediaRef(ref)) return null
  const url = decodeURIComponent(ref.slice(MEDIA_REF_PREFIX.length))
  try {
    await assertSafeUrl(url)
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(60_000) })
    if (!res.ok) {
      console.error(`[Espelho] download da midia falhou (${res.status})`)
      return null
    }
    const tamanho = Number(res.headers.get('content-length') || 0)
    if (tamanho > MAX_MIDIA_BYTES) {
      console.error(`[Espelho] midia grande demais (${tamanho} bytes)`)
      return null
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length > MAX_MIDIA_BYTES) return null
    const mimeType = (res.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim()
    return { buffer, mimeType }
  } catch (e) {
    console.error('[Espelho] download da midia falhou:', (e as Error).message)
    return null
  }
}

/** Mensagem do espelho -> payload no formato interno (UazAPI) do pipeline. */
export function toPipelinePayloadEspelho(instanceName: string, m: MensagemEspelho): Record<string, unknown> {
  const fromMe = m.direcao === 'enviada'
  const phone = m.telefone_cliente.replace(/\D/g, '')
  const id = idDaMensagem(m)
  const tipo = (m.tipo || 'text').toLowerCase()
  let texto = m.texto?.trim() || ''

  const message: Record<string, unknown> = {
    id,
    messageid: id,
    fromMe,
    // Enviada pelo outro sistema: o pipeline grava como "Via <origem>".
    wasSentByApi: fromMe,
    ...(fromMe ? {} : { senderName: m.nome_cliente || undefined, sender_pn: `${phone}@s.whatsapp.net` }),
  }

  if (UAZ_MESSAGE_TYPE[tipo] && m.midia_url) {
    message.type = 'media'
    message.messageType = UAZ_MESSAGE_TYPE[tipo]
    message.content = {
      URL: `${MEDIA_REF_PREFIX}${encodeURIComponent(m.midia_url)}`,
      mimetype: m.midia_tipo || undefined,
      // Documento: o sistema de origem manda o nome do arquivo em "texto".
      fileName: tipo === 'document' ? texto || undefined : undefined,
      PTT: false,
    }
    if (tipo === 'document') texto = ''
  } else {
    message.type = 'text'
    // Tipo que o CRM nao mostra (localizacao, figurinha sem link...): fica registrado.
    if (!texto) texto = `[${tipo}]`
  }
  if (texto) message.text = texto

  const espelho: EspelhoNoPayload = {
    ...(fromMe ? { origem_externa: m.nome_atendente || 'outro sistema' } : {}),
    ...(m.data ? { data: m.data } : {}),
    ...(m.enviado_por ? { enviado_por: m.enviado_por } : {}),
    ...(m.origem ? { origem: m.origem } : {}),
    ...(m.botoes?.length ? { botoes: m.botoes } : {}),
    ...(m.etapa ? { etapa: m.etapa } : {}),
  }

  return {
    EventType: 'messages',
    instanceName,
    provider: 'espelho',
    chat: { phone, name: m.nome_cliente || '', wa_isGroup: false },
    message,
    espelho,
  }
}
