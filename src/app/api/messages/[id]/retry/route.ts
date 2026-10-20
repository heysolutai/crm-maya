import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { getWhatsAppInstance } from '@/lib/api/database'
import type { WhatsAppInstance } from '@/lib/api/types'
import { sendToWhatsApp, marcarFalhaEnvio, marcarEnvioOk } from '@/lib/api/whatsapp'
import { getAdapter } from '@/lib/channels/registry'
import { isInsideCloudWindow } from '@/lib/channels/cloud-window'
import { paraChannelAgent, type InboxEnvio } from '@/lib/maestro/enviar'
import { checarEnvioDaIA } from '@/lib/ai/turns'
import { getRedisConnection } from '@/lib/queue/connection'
import { explicarFalhaEnvio, falhaDaMensagem, mensagemReenviavel } from '@/lib/erros/envio'

/**
 * "Tentar de novo" de uma mensagem que nao chegou no WhatsApp.
 *
 * Reenvia A MESMA linha (nao cria outra) pelo canal da inbox da conversa:
 *   - texto: adapter do canal (como o ramo de adapter do send-text / Maestro);
 *     canal sem adapter vai pelo caminho legado (sendToWhatsApp);
 *   - imagem/documento com link https: sendToWhatsApp (/send/media), que ja
 *     manda conversa de WhatsApp Cloud pelo adapter oficial.
 *
 * Deu certo: uazMessageId novo, send_error some, readStatus 'sent' e a tela
 * atualiza (message:update). Nao deu: send_error atualizado e a resposta e
 * 200 { ok:false, motivo, oQueFazer } em portugues simples; o texto cru so vai
 * pro super-admin.
 */

const paramsSchema = z.object({ id: z.string().uuid() })

const LEGENDAS_AUTOMATICAS = ['🖼️ Imagem', '📄 Documento', '📎 Mídia', '[Media]']

type Meta = Record<string, unknown>

function comoMeta(v: unknown): Meta {
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Meta) } : {}
}

// ─── Trava: dois cliques (ou duas telas) nao mandam a mesma mensagem 2x ─────

const TRAVA_MS = 60_000
const chaveTrava = (id: string) => `retry:message:${id}`

/** true = pode seguir. Redis fora/lento nao impede o reenvio (a tela ja trava o botao). */
async function travarReenvio(id: string): Promise<boolean> {
  try {
    const r = await Promise.race([
      getRedisConnection().set(chaveTrava(id), '1', 'PX', TRAVA_MS, 'NX'),
      new Promise<'lento'>((resolve) => setTimeout(() => resolve('lento'), 2_000)),
    ])
    return r === 'lento' || r === 'OK'
  } catch {
    return true
  }
}

async function soltarReenvio(id: string): Promise<void> {
  try {
    await Promise.race([
      getRedisConnection().del(chaveTrava(id)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ])
  } catch {
    // expira sozinha
  }
}

// ─── Reenvio ────────────────────────────────────────────────────────────────

type InboxDaConversa = InboxEnvio & { isActive: boolean }

interface MensagemParaReenvio {
  id: string
  conversationId: string
  messageType: string | null
  messageText: string | null
  mediaUrl: string | null
  metadata: Prisma.JsonValue | null
  conversation: {
    client: { phone: string | null } | null
    inbox: InboxDaConversa | null
  }
}

type Resultado = { ok: true } | { ok: false; erro: string }

function instanciaDaInbox(inbox: InboxDaConversa): WhatsAppInstance {
  return {
    id: inbox.id,
    instance_name: inbox.instanceName,
    api_url: inbox.apiUrl ?? '',
    instance_api_key: inbox.instanceApiKey ?? '',
    company_id: inbox.companyId,
    is_active: inbox.isActive,
  }
}

async function falhou(messageId: string, erro: unknown, companyId: string): Promise<Resultado> {
  return { ok: false, erro: await marcarFalhaEnvio(messageId, erro, { companyId }) }
}

async function reenviar(msg: MensagemParaReenvio, companyId: string): Promise<Resultado> {
  const para = (msg.conversation.client?.phone || '').replace(/\D/g, '')
  if (!para) return falhou(msg.id, 'Cliente sem telefone no cadastro: numero invalido', companyId)

  // Inbox da conversa (ja presa ao restaurante pela busca da mensagem).
  const inbox = msg.conversation.inbox && msg.conversation.inbox.companyId === companyId ? msg.conversation.inbox : null
  if (inbox && !inbox.isActive) return falhou(msg.id, 'Inbox inativa: WhatsApp desconectado', companyId)

  // WhatsApp Cloud: texto livre/midia so ate 24h da ultima mensagem do cliente.
  if (inbox?.channelType === 'whatsapp_cloud' && !(await isInsideCloudWindow(msg.conversationId))) {
    return falhou(msg.id, 'fora da janela de 24h do WhatsApp Cloud', companyId)
  }

  const tipo = (msg.messageType || 'text').toLowerCase()

  if (tipo === 'text') {
    const texto = msg.messageText || ''
    const agent = inbox ? paraChannelAgent(inbox) : null
    if (agent) {
      try {
        const r = await getAdapter(agent.channelType).sendText(agent, { to: para, text: texto })
        await marcarEnvioOk(msg.id, { providerMessageId: r.providerMessageId, companyId })
        return { ok: true }
      } catch (err) {
        return falhou(msg.id, err, companyId)
      }
    }
    // Canal sem adapter: mesmo caminho legado do send-text.
    const instance = inbox ? instanciaDaInbox(inbox) : await getWhatsAppInstance(companyId).catch(() => null)
    if (!instance) return falhou(msg.id, 'Nenhum WhatsApp ativo: nao conectado', companyId)
    const r = await sendToWhatsApp(instance, '/send/text', { number: para, text: texto }, msg.id)
    // sendToWhatsApp ja grava sucesso/falha na mensagem e avisa a tela.
    return r.success ? { ok: true } : { ok: false, erro: r.error || 'falha ao enviar' }
  }

  // Imagem / documento com link https (conferido antes por mensagemReenviavel).
  const meta = comoMeta(msg.metadata)
  const payload: Record<string, unknown> = { number: para, type: tipo, file: (msg.mediaUrl || '').trim() }
  if (tipo === 'image') {
    const legenda = (msg.messageText || '').trim()
    if (legenda && !LEGENDAS_AUTOMATICAS.includes(legenda)) payload.text = legenda
  } else {
    if (typeof meta.docName === 'string' && meta.docName) payload.docName = meta.docName
    if (typeof meta.text === 'string' && meta.text) payload.text = meta.text
  }
  const instance = inbox ? instanciaDaInbox(inbox) : await getWhatsAppInstance(companyId).catch(() => null)
  if (!instance) return falhou(msg.id, 'Nenhum WhatsApp ativo: nao conectado', companyId)
  const r = await sendToWhatsApp(instance, '/send/media', payload, msg.id)
  return r.success ? { ok: true } : { ok: false, erro: r.error || 'falha ao enviar' }
}

// ─── Rota ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof authenticate>>
  try {
    auth = await authenticate(req)
  } catch (error) {
    return handleApiError(error, 'Reenvio de mensagem: autenticacao')
  }
  const companyId = auth.companyId
  if (!companyId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 })
  }

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensagem inválida', code: 'INVALID_ID' }, { status: 400 })
  }
  const messageId = parsed.data.id

  if (!(await travarReenvio(messageId))) {
    return NextResponse.json(
      { error: 'Já estamos tentando enviar esta mensagem. Aguarde um instante.', code: 'RETRY_IN_PROGRESS' },
      { status: 409 }
    )
  }

  try {
    // IDOR: a mensagem precisa ser de uma conversa DESTE restaurante.
    const msg = await prisma.message.findFirst({
      where: { id: messageId, conversation: { companyId } },
      select: {
        id: true,
        conversationId: true,
        senderType: true,
        messageType: true,
        messageText: true,
        mediaUrl: true,
        readStatus: true,
        metadata: true,
        conversation: {
          select: {
            client: { select: { phone: true } },
            inbox: {
              select: {
                id: true, companyId: true, channelType: true, instanceName: true, displayName: true,
                phoneNumber: true, apiUrl: true, instanceApiKey: true, channelConfig: true, metadata: true,
                isActive: true,
              },
            },
          },
        },
      },
    })
    if (!msg) {
      return NextResponse.json({ error: 'Mensagem não encontrada', code: 'NOT_FOUND' }, { status: 404 })
    }
    if (msg.senderType !== 'agent' && msg.senderType !== 'ai') {
      return NextResponse.json(
        { error: 'Só dá para reenviar mensagens enviadas pelo restaurante.', code: 'NOT_OUTGOING' },
        { status: 400 }
      )
    }
    if (!falhaDaMensagem(msg.metadata, msg.readStatus)) {
      return NextResponse.json({ error: 'Esta mensagem já foi enviada.', code: 'NOT_FAILED' }, { status: 409 })
    }
    if (!mensagemReenviavel(msg)) {
      return NextResponse.json(
        { error: 'Este tipo de mensagem não pode ser reenviado. Envie de novo pela conversa.', code: 'NOT_RETRIABLE' },
        { status: 400 }
      )
    }

    // Mensagem da IA respeita a pausa de AGORA (mesma trava do send-text).
    if (msg.senderType === 'ai') {
      const envio = await checarEnvioDaIA(companyId, msg.conversationId)
      if (!envio.permitido) {
        const pausa = explicarFalhaEnvio('AI_PAUSED')
        return NextResponse.json(
          {
            error: 'A IA está pausada para este cliente, então a mensagem dela não foi reenviada.',
            code: 'AI_PAUSED',
            paused_until: envio.ate,
            motivo: 'A IA está pausada para este cliente, então a mensagem dela não foi reenviada.',
            oQueFazer: pausa.oQueFazer,
          },
          { status: 409 }
        )
      }
    }

    // Registro da tentativa (mesclado): fica no metadata em sucesso ou falha.
    const meta = comoMeta(msg.metadata)
    const tentativas = typeof meta.retry_count === 'number' ? meta.retry_count : 0
    await prisma.message.update({
      where: { id: msg.id },
      data: {
        metadata: {
          ...meta,
          retry_count: tentativas + 1,
          retried_at: new Date().toISOString(),
          retried_by: auth.agentId ?? 'api',
        } as Prisma.InputJsonObject,
      },
    })

    const resultado = await reenviar(msg, companyId)
    if (resultado.ok) {
      return NextResponse.json({ ok: true, message_id: msg.id })
    }

    const falha = explicarFalhaEnvio(resultado.erro)
    return NextResponse.json({
      ok: false,
      message_id: msg.id,
      codigo: falha.codigo,
      motivo: falha.motivo,
      oQueFazer: falha.oQueFazer,
      podeTentarDeNovo: falha.podeTentarDeNovo,
      // Texto cru so pra quem depura.
      ...(auth.isSuperAdmin ? { erro: resultado.erro } : {}),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao reenviar mensagem')
  } finally {
    await soltarReenvio(messageId)
  }
}
