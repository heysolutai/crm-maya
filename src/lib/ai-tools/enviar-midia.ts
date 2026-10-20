import { prisma } from '@/lib/db'
import { saveMessage } from '@/lib/api/database'
import { sendToWhatsApp, marcarFalhaEnvio } from '@/lib/api/whatsapp'
import type { WhatsAppInstance } from '@/lib/api/types'
import { getAdapter } from '@/lib/channels/registry'
import { isInsideCloudWindow } from '@/lib/channels/cloud-window'
import { checarEnvioDaIA, registrarBloqueio } from '@/lib/ai/turns'
import type { ChannelAgent } from '@/lib/channels/adapter'

/**
 * Envio de imagens (por URL publica https) pro cliente da conversa, como
 * mensagens da IA. Usado pelas ferramentas da IA (ex.: fotos de um evento),
 * entao funciona igual pro Maestro e pro n8n.
 *
 * Usa a inbox DA conversa (nunca "a primeira ativa"), respeita a pausa da IA
 * e nunca lanca: devolve o que saiu e por que parou.
 */

export const MAX_IMAGENS = 5
const PAUSA_ENTRE_ENVIOS_MS = 800

export interface DestinoImagem {
  inboxId: string
  channelType: string
  conversationId: string
  messageId: string
  para: string
  url: string
  legenda?: string
  agent: ChannelAgent | null
  instance: WhatsAppInstance
}

export interface OpcoesImagens {
  esperar?: (ms: number) => Promise<void>
  /** Entrega no canal (injetavel pra teste). Lanca se falhar. */
  canal?: (d: DestinoImagem) => Promise<void>
}

export interface ResultadoImagens {
  enviadas: number
  /** IA pausada pro cliente: nada foi enviado. */
  pausada: boolean
  /** Motivo de nao ter enviado tudo (texto curto, so pro log/resultado). */
  motivo?: string
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function urlHttpsValida(u: unknown): u is string {
  if (typeof u !== 'string') return false
  try {
    const url = new URL(u.trim())
    return url.protocol === 'https:' && !!url.hostname
  } catch {
    return false
  }
}

async function entregarNoCanal(d: DestinoImagem): Promise<void> {
  if (d.channelType === 'whatsapp_cloud') {
    if (!(await isInsideCloudWindow(d.conversationId))) {
      throw new Error('fora da janela de 24h do WhatsApp Cloud')
    }
    if (!d.agent) throw new Error('canal sem adapter')
    const adapter = getAdapter('whatsapp_cloud')
    if (!adapter.sendMedia) throw new Error('canal sem envio de midia')
    const r = await adapter.sendMedia(d.agent, { to: d.para, type: 'image', url: d.url, caption: d.legenda })
    await prisma.message
      .update({ where: { id: d.messageId }, data: { uazMessageId: r.providerMessageId || null } })
      .catch(() => {})
    return
  }
  // uazapi e demais: mesmo caminho da rota send-media, com as credenciais DESTA inbox.
  const r = await sendToWhatsApp(
    d.instance,
    '/send/media',
    { phone: d.para, type: 'image', file: d.url, ...(d.legenda ? { text: d.legenda } : {}), fromAI: true },
    d.messageId
  )
  if (!r.success) throw new Error(r.error || 'falha ao enviar')
}

export async function enviarImagensDaIA(
  params: { companyId: string; conversationId: string; urls: string[]; legendaPrimeira?: string },
  opcoes: OpcoesImagens = {}
): Promise<ResultadoImagens> {
  const esperar = opcoes.esperar ?? dormir
  const canal = opcoes.canal ?? entregarNoCanal
  try {
    const urls = params.urls.filter(urlHttpsValida).map((u) => u.trim()).slice(0, MAX_IMAGENS)
    if (!urls.length) return { enviadas: 0, pausada: false, motivo: 'sem fotos validas (https)' }

    const conv = await prisma.conversation.findFirst({
      where: { id: params.conversationId, companyId: params.companyId },
      select: {
        client: { select: { phone: true } },
        inbox: {
          select: {
            id: true, companyId: true, channelType: true, instanceName: true, displayName: true,
            phoneNumber: true, apiUrl: true, instanceApiKey: true, channelConfig: true, metadata: true, isActive: true,
          },
        },
      },
    })
    const inbox = conv?.inbox
    const para = (conv?.client?.phone || '').replace(/\D/g, '')
    if (!conv || !inbox || !para) return { enviadas: 0, pausada: false, motivo: 'conversa sem canal ou telefone' }

    const envio = await checarEnvioDaIA(params.companyId, params.conversationId)
    if (!envio.permitido) {
      await registrarBloqueio(params.companyId, params.conversationId, envio.ate)
      return { enviadas: 0, pausada: true, motivo: 'IA pausada para este cliente' }
    }

    const rec = (v: unknown): Record<string, unknown> | null =>
      v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
    const agent: ChannelAgent | null =
      inbox.channelType === 'whatsapp_cloud'
        ? {
            id: inbox.id, companyId: inbox.companyId, channelType: 'whatsapp_cloud', instanceName: inbox.instanceName,
            displayName: inbox.displayName, phoneNumber: inbox.phoneNumber, apiUrl: inbox.apiUrl,
            instanceApiKey: inbox.instanceApiKey, channelConfig: rec(inbox.channelConfig), metadata: rec(inbox.metadata),
          }
        : null
    const instance: WhatsAppInstance = {
      id: inbox.id,
      instance_name: inbox.instanceName,
      api_url: inbox.apiUrl ?? '',
      instance_api_key: inbox.instanceApiKey ?? '',
      company_id: inbox.companyId,
      is_active: inbox.isActive,
    }

    let enviadas = 0
    let motivo: string | undefined
    for (let i = 0; i < urls.length; i++) {
      if (i > 0) await esperar(PAUSA_ENTRE_ENVIOS_MS)
      const legenda = i === 0 ? params.legendaPrimeira?.slice(0, 500) : undefined
      const msg = await saveMessage(params.conversationId, legenda || '', 'image', true, null, urls[i], {
        source: 'ai_tool',
        channel: inbox.channelType,
        ...(legenda ? { text: legenda } : {}),
      })
      try {
        await canal({
          inboxId: inbox.id, channelType: inbox.channelType, conversationId: params.conversationId,
          messageId: msg.id, para, url: urls[i], legenda, agent, instance,
        })
        enviadas++
      } catch (err) {
        motivo = ((err as Error)?.message || 'erro desconhecido').slice(0, 200)
        console.error('[ai-tools] envio de imagem falhou:', motivo)
        // readStatus 'failed' + send_error mesclado + aviso pra tela (nunca lanca).
        await marcarFalhaEnvio(msg.id, err, { companyId: params.companyId })
        break
      }
    }
    return { enviadas, pausada: false, motivo }
  } catch (err) {
    console.error('[ai-tools] enviarImagensDaIA falhou:', (err as Error)?.message)
    return { enviadas: 0, pausada: false, motivo: 'erro ao enviar' }
  }
}
