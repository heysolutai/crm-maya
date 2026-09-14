import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { authenticate } from '@/lib/api/auth'
import { handleApiError } from '@/lib/api/errors'
import { isOwnedStorageUrl } from '@/lib/storage'
import { enqueueMediaProcessing, type MediaProcessingJob } from '@/lib/queue/queues'
import { garantirAudioReproduzivel } from '@/lib/whatsapp/audio-para-tela'

/**
 * Reparo de midia.
 *
 * Duas coisas diferentes que a tela mostra igual ("nao toca"):
 *   1. Arquivo que nunca chegou ao armazenamento (download/upload falhou):
 *      reenfileira o worker pelo id da mensagem na UAZapi.
 *   2. Audio guardado em OGG/Opus, que Safari e iPhone nao tocam: converte
 *      pra MP3 e troca a URL da mensagem.
 *
 * GET  = so conta (nao muda nada)
 * POST = { messageId } repara uma; { limit } repara as ultimas N;
 *        { transcodeAudio: true, limit } converte N audios.
 */

const MEDIA_TYPES = ['audio', 'ptt', 'image', 'video', 'document', 'sticker']
const AUDIO_TYPES = ['audio', 'ptt']

function ehAudioNaoUniversal(mediaUrl: string | null, metadata: unknown): boolean {
  if (!mediaUrl || !isOwnedStorageUrl(mediaUrl)) return false
  const meta = (metadata || {}) as Record<string, unknown>
  const mime = typeof meta.mimeType === 'string' ? meta.mimeType : typeof meta.mime_type === 'string' ? meta.mime_type : ''
  if (/^audio\/(mpeg|mp4|aac|wav|x-m4a)$/i.test(mime)) return false
  return !/\.(mp3|m4a|aac|wav)(\?|$)/i.test(mediaUrl)
}

async function buscarAudiosNaoUniversais(companyId: string, limite: number) {
  const candidatos = await prisma.message.findMany({
    where: { conversation: { companyId }, messageType: { in: AUDIO_TYPES }, mediaUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: limite,
    select: { id: true, conversationId: true, mediaUrl: true, metadata: true },
  })
  return candidatos.filter((m) => ehAudioNaoUniversal(m.mediaUrl, m.metadata))
}

/** Teto por chamada: e request HTTP, nao job. A tela chama de novo enquanto houver restantes. */
const ORCAMENTO_MS = 25_000

async function converterAudiosAntigos(companyId: string, limite: number) {
  const inicio = Date.now()
  const alvo = await buscarAudiosNaoUniversais(companyId, Math.min(2000, limite * 10))

  let convertidos = 0
  let falhas = 0
  let processados = 0
  const erros: string[] = []

  for (const msg of alvo) {
    if (convertidos + falhas >= limite || Date.now() - inicio > ORCAMENTO_MS) break
    processados++
    const meta = (msg.metadata || {}) as Record<string, unknown>
    const mime = typeof meta.mimeType === 'string' ? meta.mimeType : typeof meta.mime_type === 'string' ? meta.mime_type : 'audio/ogg'

    const tela = await garantirAudioReproduzivel({ url: msg.mediaUrl!, mime, companyId, conversationId: msg.conversationId })
    if (!tela.convertido) {
      falhas++
      if (tela.erro && erros.length < 5) erros.push(tela.erro)
      continue
    }

    const metadata = {
      ...meta,
      mimeType: tela.mime,
      original_media_url: msg.mediaUrl,
      ...(tela.mimeOriginal ? { original_mime: tela.mimeOriginal } : {}),
      media_transcoded_at: new Date().toISOString(),
    }
    await prisma.message.updateMany({
      where: { id: msg.id, conversation: { companyId } },
      data: { mediaUrl: tela.url, metadata: metadata as object },
    })
    convertidos++
  }

  return { convertidos, falhas, restantes: Math.max(0, alvo.length - processados), erros }
}

async function buscarQuebradas(companyId: string, limite: number) {
  const candidatas = await prisma.message.findMany({
    where: { conversation: { companyId }, messageType: { in: MEDIA_TYPES } },
    orderBy: { createdAt: 'desc' },
    take: limite,
    select: {
      id: true,
      conversationId: true,
      messageType: true,
      mediaUrl: true,
      uazMessageId: true,
      createdAt: true,
      metadata: true,
    },
  })
  // Quebrada = sem arquivo no nosso storage. So da pra rebaixar com o id da
  // mensagem no provedor.
  return candidatas.filter((m) => !isOwnedStorageUrl(m.mediaUrl))
}

async function reenfileirar(companyId: string, msgs: Awaited<ReturnType<typeof buscarQuebradas>>) {
  let reenfileiradas = 0
  let semReferencia = 0
  const inboxes = new Map<string, { apiUrl: string; instanceApiKey: string } | null>()

  for (const m of msgs) {
    if (!m.uazMessageId) {
      semReferencia++
      continue
    }
    const conv = await prisma.conversation.findFirst({
      where: { id: m.conversationId, companyId },
      select: { inboxId: true },
    })
    const inboxId = conv?.inboxId || ''
    if (!inboxes.has(inboxId)) {
      const inbox = inboxId
        ? await prisma.inbox.findFirst({ where: { id: inboxId, companyId }, select: { apiUrl: true, instanceApiKey: true } })
        : null
      inboxes.set(inboxId, inbox?.apiUrl && inbox.instanceApiKey ? { apiUrl: inbox.apiUrl, instanceApiKey: inbox.instanceApiKey } : null)
    }
    const cred = inboxes.get(inboxId)
    if (!cred) {
      semReferencia++
      continue
    }

    const meta = (m.metadata || {}) as Record<string, unknown>
    // Marcador de falha some agora: a bolha volta pra "recuperando" enquanto o
    // worker roda; se falhar de novo, ele grava o motivo de novo.
    const { media_error: _e, media_failed_at: _f, media_attempts: _a, ...metaLimpo } = meta
    await prisma.message.updateMany({
      where: { id: m.id, conversation: { companyId } },
      data: { metadata: metaLimpo as object },
    })

    await enqueueMediaProcessing({
      messageId: m.id,
      conversationId: m.conversationId,
      companyId,
      mediaUrl: m.mediaUrl || '',
      mediaType: (m.messageType === 'ptt' ? 'audio' : m.messageType) as MediaProcessingJob['mediaType'],
      mimeType: typeof meta.mimeType === 'string' ? meta.mimeType : 'application/octet-stream',
      instanceApiUrl: cred.apiUrl,
      instanceApiKey: cred.instanceApiKey,
      messageKey: m.uazMessageId,
    })
    reenfileiradas++
  }
  return { reenfileiradas, semReferencia }
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }
  try {
    const limite = Math.min(2000, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '500', 10)))
    const quebradas = await buscarQuebradas(auth.companyId, limite)
    const porTipo: Record<string, number> = {}
    for (const m of quebradas) porTipo[m.messageType || '?'] = (porTipo[m.messageType || '?'] || 0) + 1
    const audiosNaoMp3 = (await buscarAudiosNaoUniversais(auth.companyId, 500)).length

    return NextResponse.json({
      analisadas: limite,
      quebradas: quebradas.length,
      audiosNaoMp3,
      porTipo,
      amostra: quebradas.slice(0, 10).map((m) => ({
        id: m.id,
        tipo: m.messageType,
        criadaEm: m.createdAt,
        temIdDoProvedor: !!m.uazMessageId,
      })),
    })
  } catch (error) {
    return handleApiError(error, 'Erro ao diagnosticar midias')
  }
}

const repararSchema = z.object({
  limit: z.number().int().min(1).max(500).optional(),
  messageId: z.string().uuid().optional(),
  transcodeAudio: z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (!auth.companyId) {
    return NextResponse.json({ error: 'Restaurante nao encontrado' }, { status: 403 })
  }
  try {
    const body = await req.json().catch(() => ({}))
    const validation = repararSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Dados invalidos', details: validation.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    if (validation.data.transcodeAudio) {
      return NextResponse.json(await converterAudiosAntigos(auth.companyId, validation.data.limit ?? 20))
    }

    const { messageId } = validation.data
    const limite = messageId ? 1 : (validation.data.limit ?? 100)
    const todas = await buscarQuebradas(auth.companyId, messageId ? 5000 : Math.min(5000, limite * 10))
    const alvo = messageId ? todas.filter((m) => m.id === messageId) : todas.slice(0, limite)

    if (messageId && alvo.length === 0) {
      return NextResponse.json({ error: 'Mensagem nao encontrada ou ja tem arquivo' }, { status: 404 })
    }

    const resultado = await reenfileirar(auth.companyId, alvo)
    return NextResponse.json({ success: true, ...resultado })
  } catch (error) {
    return handleApiError(error, 'Erro ao reparar midias')
  }
}
