import { Worker, Job } from 'bullmq'
import { getRedisConnection } from '../connection'
import { QUEUE_NAMES, type TranscriptionJob, enqueueN8NWebhook } from '../queues'
import { prisma } from '@/lib/db'
import { uploadToB2, buildB2Key, MIME_TO_EXT, isOwnedStorageUrl } from '@/lib/storage'
import { prepararAudioParaWeb } from '@/lib/audio-transcode'
import { getSystemSettingFresh } from '@/lib/system-settings'

interface UazDownloadResult {
  transcription: string | null
  buffer: Buffer | null
  mimeType: string
  /** Mensagem do provider quando transcricao falhou (pra log/debug) */
  transcriptionError?: string
}

/**
 * Fallback: transcreve direto pelo Whisper da OpenAI quando o UazAPI
 * nao retorna transcricao. Usa o buffer ja baixado.
 */
async function transcribeWithWhisper(
  buffer: Buffer,
  mimeType: string,
  openAiKey: string
): Promise<string | null> {
  try {
    const ext = (mimeType.split('/')[1] || 'ogg').split(';')[0].trim()
    const filename = `audio.${ext}`

    const form = new FormData()
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType })
    form.append('file', blob, filename)
    form.append('model', 'whisper-1')
    form.append('response_format', 'json')
    form.append('language', 'pt')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openAiKey}`,
      },
      body: form,
    })

    if (!res.ok) {
      const txt = await res.text()
      console.error(`[Transcription Worker] Whisper falhou (${res.status}):`, txt.slice(0, 300))
      return null
    }

    const data = await res.json()
    const text: string = (data?.text || '').trim()
    return text || null
  } catch (err: any) {
    console.error('[Transcription Worker] Whisper exception:', err.message)
    return null
  }
}

// Pede base64 + transcricao na mesma call do UAZapi /message/download.
// Os dois sao flags independentes, entao economiza uma round-trip.
async function fetchAudioFromUazAPI(
  messageKey: string,
  instanceApiKey: string,
  instanceApiUrl: string,
  openAiKey: string
): Promise<UazDownloadResult> {
  const empty: UazDownloadResult = { transcription: null, buffer: null, mimeType: 'audio/ogg' }
  try {
    const url = `${instanceApiUrl}/message/download`
    console.log(`[Transcription Worker] Calling UazAPI: ${url}, id: ${messageKey}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': instanceApiKey,
      },
      body: JSON.stringify({
        id: messageKey,
        return_base64: true, // pega bytes pra subir no B2
        generate_mp3: false,
        // Audio longo NAO volta em base64: a UAZapi devolve so um link. Com o
        // link desligado, a resposta vinha com a transcricao e sem os bytes —
        // nada subia pro B2 e a mensagem ficava apontando pra URL criptografada
        // do WhatsApp, que o proxy recusa (403 no player). Era exatamente o
        // caso de "transcreveu mas o audio nao toca".
        return_link: true,
        transcribe: true, // pega transcricao na mesma chamada
        openai_apikey: openAiKey,
        download_quoted: false,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Transcription Worker] UazAPI error (${response.status}):`, errorText)
      return empty
    }

    const result = await response.json()
    console.log(`[Transcription Worker] UazAPI response keys:`, Object.keys(result))

    const transcription: string | null = result.transcription || result.text || null
    const transcriptionError: string | undefined =
      result.transcription_error || result.transcriptionError || result.error || undefined
    if (!transcription && transcriptionError) {
      console.warn('[Transcription Worker] UazAPI nao retornou transcricao:', transcriptionError)
    }
    const rawBase64 = result.base64Data || result.base64 || result.data || result.file || result.content
    const mimeType: string = result.mimetype || result.mimeType || result.mime_type || 'audio/ogg'

    let buffer: Buffer | null = null
    if (rawBase64 && typeof rawBase64 === 'string' && rawBase64.length > 10) {
      let clean = rawBase64
      const commaIdx = clean.indexOf(',')
      if (commaIdx !== -1 && commaIdx < 100) clean = clean.substring(commaIdx + 1)
      clean = clean.replace(/[\s\r\n]/g, '')
      try {
        buffer = Buffer.from(clean, 'base64')
        if (buffer.length === 0) buffer = null
      } catch (decodeErr) {
        console.error('[Transcription Worker] base64 decode falhou:', decodeErr)
      }
    }

    let mimeFinal = mimeType
    // Sem base64: baixa pelo link temporario que a UAZapi devolveu.
    if (!buffer) {
      const fileUrl = result.fileURL || result.fileUrl || result.url || result.link
      if (typeof fileUrl === 'string' && fileUrl.startsWith('http')) {
        console.log('[Transcription Worker] base64 vazio, baixando por fileURL')
        try {
          const fileRes = await fetch(fileUrl)
          if (fileRes.ok) {
            buffer = Buffer.from(await fileRes.arrayBuffer())
            mimeFinal = fileRes.headers.get('content-type') || mimeType
            if (buffer.length === 0) buffer = null
          } else {
            console.error(`[Transcription Worker] fileURL falhou (${fileRes.status})`)
          }
        } catch (e) {
          console.error('[Transcription Worker] excecao no fileURL:', (e as Error).message)
        }
      }
    }

    return {
      transcription,
      buffer,
      mimeType: mimeFinal.split(';')[0].trim(),
      transcriptionError,
    }
  } catch (err: any) {
    console.error('[Transcription Worker] UazAPI exception:', err.message)
    return empty
  }
}

async function processTranscription(job: Job<TranscriptionJob>) {
  const {
    messageId, conversationId, companyId,
    instanceApiUrl, instanceApiKey, messageKey,
    n8nWebhookUrl, n8nPayload,
  } = job.data

  console.log(`[Transcription Worker] Processing job ${job.id} for message ${messageId}`)

  // O n8n TEM que ser chamado em todo caminho, com ou sem texto. Antes so era
  // chamado quando a transcricao dava certo: audio de avaliacao com Whisper
  // fora do ar, sem chave ou sem credencial da instancia simplesmente nao
  // chegava no fluxo, e a IA nunca respondia.
  const notificarN8n = async (transcription: string | null, mediaUrl: string | null, motivo?: string) => {
    if (!n8nWebhookUrl || !n8nPayload) return
    await enqueueN8NWebhook({
      webhookUrl: n8nWebhookUrl,
      payload: {
        ...n8nPayload,
        conteudo: transcription || '',
        tipo_mensagem: 'audio',
        transcricao_ok: !!transcription,
        ...(motivo ? { transcricao_erro: motivo } : {}),
        // URL estavel do B2 quando temos; senao a que veio do webhook.
        ...(mediaUrl ? { media_url: mediaUrl } : {}),
      },
      companyId,
      conversationId,
      messageId,
    })
    console.log(`[Transcription Worker] N8N webhook enfileirado (transcricao ${transcription ? 'ok' : 'ausente'})`)
  }

  // Resolve OpenAI key: prioridade companyKey > fallback global.
  // Mesma logica usada em /api/webhooks/whatsapp e /api/messaging/transcribe
  // pra manter consistencia (worker antes so usava o global, ignorando key
  // configurada pelo cliente).
  let companyKey: string | null = null
  try {
    const aiConfig = await prisma.aiAgent.findFirst({
      where: { companyId },
      select: { apiKeys: true },
      orderBy: { createdAt: 'desc' },
    })
    const candidate = (aiConfig?.apiKeys as Record<string, unknown> | null)?.openai
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      companyKey = candidate.trim()
    }
  } catch (err) {
    console.warn('[Transcription Worker] Falha ao buscar aiAgent da company; usando fallback', err)
  }

  const openAiKey = companyKey || (await getSystemSettingFresh('default_openai_api_key'))
  if (!openAiKey) {
    console.warn(`[Transcription Worker] No OpenAI API key (company nem global): segue sem texto`)
    await notificarN8n(null, null, 'sem chave da OpenAI')
    return { messageId, transcription: null, reason: 'no_api_key' }
  }
  console.log(
    `[Transcription Worker] Using OpenAI key from ${companyKey ? 'company' : 'global'}: ...${openAiKey.slice(-4)}`,
  )

  if (!instanceApiUrl || !instanceApiKey || !messageKey) {
    console.warn(`[Transcription Worker] Missing UazAPI credentials for message ${messageId}`)
    await notificarN8n(null, null, 'sem credencial da instancia')
    return { messageId, transcription: null, reason: 'missing_instance' }
  }

  const downloadResult = await fetchAudioFromUazAPI(
    messageKey, instanceApiKey, instanceApiUrl, openAiKey
  )
  let transcription = downloadResult.transcription
  const { buffer, mimeType, transcriptionError } = downloadResult

  // Fallback: se UazAPI nao deu transcricao mas baixou o audio, chamamos
  // o Whisper da OpenAI direto. Cobre casos em que o UazAPI nao expoe a
  // transcricao na response (bug ou versao antiga) ou a key dele falhou.
  if (!transcription && buffer && buffer.length > 0) {
    console.log('[Transcription Worker] UazAPI nao retornou transcricao; tentando Whisper direto')
    transcription = await transcribeWithWhisper(buffer, mimeType, openAiKey)
    if (transcription) {
      console.log('[Transcription Worker] Whisper fallback OK')
    }
  }

  // Sobe os bytes pro B2 antes de qualquer outra coisa: assim o player do
  // frontend deixa de bater na URL criptografada do WhatsApp (que da 403).
  let b2Url: string | null = null
  let falhaNoUpload: string | null = null
  let mimeGravado = mimeType
  let mimeOriginal: string | undefined
  if (buffer && buffer.length > 0) {
    try {
      // MP3 pra tela: OGG/Opus nao toca em Safari/iPhone. O original ja serviu
      // pra transcricao acima.
      const web = await prepararAudioParaWeb(buffer, mimeType)
      if (web.erro) console.warn(`[Transcription Worker] audio ${messageId} segue sem conversao: ${web.erro}`)
      mimeGravado = web.mime
      mimeOriginal = web.mimeOriginal
      const ext = MIME_TO_EXT[web.mime] || web.mime.split('/')[1] || 'ogg'
      const key = buildB2Key('audio', companyId, conversationId, ext)
      b2Url = await uploadToB2(web.buffer, key, web.mime)
      console.log(`[Transcription Worker] B2 upload OK: ${b2Url} (${web.buffer.length} bytes, ${web.mime})`)
    } catch (uploadErr: any) {
      // E esta falha que deixava a mensagem apontando pra URL criptografada do
      // WhatsApp: a transcricao aparecia (os bytes vieram pelo /message/download,
      // com token) mas o player do navegador levava 403 na mesma midia.
      console.error('[Transcription Worker] B2 upload falhou:', uploadErr?.message)
      falhaNoUpload = uploadErr?.message || 'erro desconhecido'
    }
  } else {
    // Nem base64 nem link: sem bytes nao ha o que subir. Marcar como falha e o
    // que faz a bolha oferecer "Tentar de novo" (que passa pelo worker de
    // midia, com outro caminho de download) em vez de exibir um player morto.
    console.warn('[Transcription Worker] UazAPI nao devolveu o arquivo do audio (nem base64 nem link)')
    falhaNoUpload = 'a UAZapi nao devolveu o arquivo do audio'
  }

  // Le metadata atual pra preservar campos existentes (ex: docName, fileSize)
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { metadata: true, mediaUrl: true },
  })
  const prevMeta = (existing?.metadata as Record<string, unknown>) || {}

  // Upload falhou e a mensagem aponta pra URL do provedor: melhor ficar sem
  // midia, mostrando o motivo e o botao "Tentar de novo", do que exibir um
  // player que responde 403 em cima de um audio que ate foi transcrito.
  const zerarMidia = !b2Url && !!falhaNoUpload && !isOwnedStorageUrl(existing?.mediaUrl)
  const patchMidia = b2Url ? { mediaUrl: b2Url } : zerarMidia ? { mediaUrl: null } : {}
  const marcaFalha = falhaNoUpload
    ? { media_error: `Upload do audio falhou: ${falhaNoUpload}`, media_failed_at: new Date().toISOString() }
    : {}

  if (transcription) {
    console.log(`[Transcription Worker] Transcription: "${transcription.substring(0, 100)}"`)

    // Quem transcreveu? UazAPI quando veio na primeira chamada; senao foi Whisper direto.
    const transcriptionSource = downloadResult.transcription ? 'uazapi' : 'openai_whisper'

    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: transcription,
        ...patchMidia,
        metadata: {
          ...prevMeta,
          ...(b2Url ? { mimeType: mimeGravado, ...(mimeOriginal ? { original_mime: mimeOriginal } : {}) } : {}),
          ...marcaFalha,
          transcribed: true,
          transcription_source: transcriptionSource,
          transcribed_at: new Date().toISOString(),
          ...(transcriptionError ? { uazapi_transcription_error: transcriptionError } : {}),
        } as any,
      },
    })

    await notificarN8n(transcription, b2Url)
  } else {
    console.error(
      `[Transcription Worker] Transcription failed for message ${messageId}`,
      transcriptionError ? `(uazapi: ${transcriptionError})` : ''
    )

    // Mesmo sem transcricao, salva a mediaUrl do B2 se conseguimos baixar.
    await prisma.message.update({
      where: { id: messageId },
      data: {
        messageText: '[Audio - transcricao falhou]',
        ...patchMidia,
        metadata: {
          ...prevMeta,
          ...marcaFalha,
          transcribed: false,
          transcription_error: true,
          transcription_attempted_at: new Date().toISOString(),
          ...(transcriptionError ? { uazapi_transcription_error: transcriptionError } : {}),
        } as any,
      },
    })

    // Sem texto, mas com o audio: o fluxo decide o que fazer (pedir pra
    // repetir, transcrever por outro caminho, seguir com a URL).
    await notificarN8n(null, b2Url, transcriptionError || 'transcricao falhou')
  }

  return { messageId, transcription: !!transcription, mediaUrlUpdated: !!b2Url }
}

let worker: Worker<TranscriptionJob> | null = null

export function startTranscriptionWorker() {
  if (worker) return worker

  worker = new Worker<TranscriptionJob>(
    QUEUE_NAMES.TRANSCRIPTION,
    processTranscription,
    {
      connection: getRedisConnection(),
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 60000,
      },
    }
  )

  worker.on('completed', (job) => {
    console.log(`[Transcription Worker] Job ${job.id} completed`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[Transcription Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message)
  })

  console.log('[Transcription Worker] Started')
  return worker
}

export function stopTranscriptionWorker() {
  if (worker) {
    worker.close()
    worker = null
  }
}
