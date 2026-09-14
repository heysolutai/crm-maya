import { prepararAudioParaWeb } from '@/lib/audio-transcode'
import { uploadToB2, buildB2Key, MIME_TO_EXT, isOwnedStorageUrl } from '@/lib/storage'

/**
 * Garante que o audio que a MENSAGEM aponta (mediaUrl) toca em qualquer
 * navegador.
 *
 * Existe porque o mesmo arquivo servia a dois donos com exigencias opostas: o
 * WhatsApp so renderiza nota de voz em OGG/Opus, e Safari/iOS nao tocam
 * OGG/Opus em <audio>. Guardar um so formato quebrava um dos lados: e o lado
 * que quebrava era a tela ("formato nao suportado pelo navegador").
 *
 * Solucao: dois objetos. O OGG segue existindo e e o que vai pro provedor; a
 * mensagem passa a apontar pro MP3. Esta funcao produz o MP3 a partir do buffer
 * (quando quem chamou ja tem os bytes) ou baixando a URL do nosso storage.
 */

const FORMATOS_UNIVERSAIS = new Set(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-m4a'])

export interface EntradaAudioTela {
  /** Bytes do audio, se ja estiverem em maos: evita baixar de novo. */
  buffer?: Buffer
  /** URL do audio no NOSSO storage. Obrigatoria quando nao ha buffer. */
  url: string
  mime: string
  companyId: string
  conversationId: string
}

export interface AudioTela {
  url: string
  mime: string
  /** Formato de origem, quando houve conversao. */
  mimeOriginal?: string
  /** true quando um objeto novo foi criado no storage. */
  convertido: boolean
  erro?: string
}

/**
 * Devolve a URL que a mensagem deve guardar.
 *
 * Nunca lanca: se nao conseguir converter, devolve a URL original com o erro -
 * o Chrome ainda toca OGG, e e melhor que perder o envio.
 */
export async function garantirAudioReproduzivel(entrada: EntradaAudioTela): Promise<AudioTela> {
  const mimeBase = (entrada.mime || '').split(';')[0].trim().toLowerCase()

  // Ja e universal: nada a fazer, nem download.
  if (FORMATOS_UNIVERSAIS.has(mimeBase)) {
    return { url: entrada.url, mime: mimeBase, convertido: false }
  }

  let bytes = entrada.buffer
  if (!bytes) {
    // So baixamos do nosso proprio storage: a URL veio do banco ou do upload
    // interno, nunca de input livre do usuario.
    if (!isOwnedStorageUrl(entrada.url)) {
      return { url: entrada.url, mime: mimeBase || 'audio/ogg', convertido: false, erro: 'URL fora do storage proprio' }
    }
    try {
      const res = await fetch(entrada.url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) })
      if (!res.ok) {
        return { url: entrada.url, mime: mimeBase || 'audio/ogg', convertido: false, erro: `download do original falhou (${res.status})` }
      }
      bytes = Buffer.from(await res.arrayBuffer())
    } catch (e) {
      return { url: entrada.url, mime: mimeBase || 'audio/ogg', convertido: false, erro: `download do original falhou: ${(e as Error).message}` }
    }
  }

  const web = await prepararAudioParaWeb(bytes, mimeBase)
  if (web.erro || web.mime === mimeBase) {
    // Sem conversao (falhou, ou o buffer ja era universal apesar do mime
    // declarado). A URL de entrada continua valendo.
    return { url: entrada.url, mime: web.mime, convertido: false, erro: web.erro }
  }

  try {
    const ext = MIME_TO_EXT[web.mime] || 'mp3'
    const key = buildB2Key('audio', entrada.companyId, entrada.conversationId, ext)
    const url = await uploadToB2(web.buffer, key, web.mime)
    return { url, mime: web.mime, mimeOriginal: web.mimeOriginal, convertido: true }
  } catch (e) {
    return { url: entrada.url, mime: mimeBase || 'audio/ogg', convertido: false, erro: `upload do MP3 falhou: ${(e as Error).message}` }
  }
}
