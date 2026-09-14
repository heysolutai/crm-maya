import { spawn } from 'child_process'

/**
 * Conversao de audio com ffmpeg, por stdin/stdout: sem arquivo temporario,
 * sem disco, sem limpeza pendente se o processo morrer no meio.
 *
 * Dois destinos, por dois motivos diferentes:
 *
 *  - OGG/Opus: o unico formato que a Meta renderiza como nota de voz (bolha de
 *    microfone). E o que vai PRO WHATSAPP.
 *  - MP3: o unico formato que TODO navegador reproduz. Safari e iOS nao tocam
 *    OGG/Opus em <audio>: o player mostrava "formato nao suportado" pra toda
 *    nota de voz. E o que fica GUARDADO pra tela.
 *
 * Nenhuma funcao aqui lanca: se o ffmpeg falhar ou nao existir, devolve o
 * buffer original com o motivo. Audio no formato errado e pior que no certo,
 * mas melhor que mensagem perdida.
 */

/** Teto de duracao: audio muito longo nao e nota de voz, e converter travaria o request. */
const TIMEOUT_MS = 60_000

/**
 * Detecta OGG/Opus pelo cabecalho. "OggS" abre o conteiner e "OpusHead"
 * identifica o codec: a extensao nao serve, porque .ogg tambem aceita Vorbis.
 */
export function jaEhOpus(buffer: Buffer): boolean {
  if (buffer.length < 64) return false
  const inicio = buffer.subarray(0, 64).toString('latin1')
  return inicio.startsWith('OggS') && inicio.includes('OpusHead')
}

/**
 * Detecta MP3 pelo cabecalho: tag ID3 ou frame sync (11 bits em 1) logo no
 * inicio. Cobre o que sai do ffmpeg e o que vem de gravador comum.
 */
export function jaEhMp3(buffer: Buffer): boolean {
  if (buffer.length < 4) return false
  if (buffer.subarray(0, 3).toString('latin1') === 'ID3') return true
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0
}

export interface ResultadoConversao {
  buffer: Buffer
  convertido: boolean
  erro?: string
}

function rodarFfmpeg(buffer: Buffer, args: string[], rotulo: string): Promise<ResultadoConversao> {
  return new Promise((resolve) => {
    let ff: ReturnType<typeof spawn>
    try {
      ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', ...args, 'pipe:1'])
    } catch (e) {
      resolve({ buffer, convertido: false, erro: `ffmpeg indisponivel: ${(e as Error).message}` })
      return
    }

    const saida: Buffer[] = []
    const erros: string[] = []
    let encerrado = false

    const finalizar = (r: ResultadoConversao) => {
      if (encerrado) return
      encerrado = true
      clearTimeout(timer)
      resolve(r)
    }

    const timer = setTimeout(() => {
      ff.kill('SIGKILL')
      finalizar({ buffer, convertido: false, erro: 'timeout na conversao (60s)' })
    }, TIMEOUT_MS)

    ff.stdout?.on('data', (c: Buffer) => saida.push(c))
    ff.stderr?.on('data', (c: Buffer) => erros.push(c.toString()))

    ff.on('error', (e) => {
      finalizar({ buffer, convertido: false, erro: `ffmpeg nao executou: ${e.message}` })
    })

    ff.on('close', (code) => {
      const convertido = Buffer.concat(saida)
      if (code !== 0 || convertido.length === 0) {
        finalizar({
          buffer,
          convertido: false,
          erro: `ffmpeg saiu com codigo ${code}: ${erros.join('').slice(0, 200)}`,
        })
        return
      }
      console.log(`[audio] convertido pra ${rotulo}: ${buffer.length} -> ${convertido.length} bytes`)
      finalizar({ buffer: convertido, convertido: true })
    })

    // stdin pode fechar antes da escrita terminar se o ffmpeg abortar cedo.
    ff.stdin?.on('error', () => {})
    ff.stdin?.end(buffer)
  })
}

/**
 * Devolve o audio em OGG/Opus (pra enviar ao WhatsApp como nota de voz). Se ja
 * estiver no formato, retorna o original sem gastar CPU.
 */
export async function converterParaOpus(buffer: Buffer): Promise<ResultadoConversao> {
  if (jaEhOpus(buffer)) return { buffer, convertido: false }
  return rodarFfmpeg(
    buffer,
    [
      '-vn',                  // descarta video, se houver
      '-c:a', 'libopus',
      '-b:a', '32k',          // suficiente pra voz; mantem o arquivo pequeno
      '-ac', '1',             // mono: nota de voz e mono, e alguns clientes recusam estereo
      '-application', 'voip', // perfil do Opus otimizado pra fala
      '-f', 'ogg',
    ],
    'OGG/Opus'
  )
}

/**
 * Devolve o audio em MP3 (pra guardar e tocar no navegador). Se ja for MP3,
 * retorna o original sem gastar CPU.
 *
 * MP3 e nao AAC/M4A porque MP4 nao e streamavel por pipe (o ffmpeg precisa
 * voltar ao inicio pra escrever o "moov"); MP3 sai em fluxo e toca em tudo.
 */
export async function converterParaMp3(buffer: Buffer): Promise<ResultadoConversao> {
  if (jaEhMp3(buffer)) return { buffer, convertido: false }
  return rodarFfmpeg(
    buffer,
    [
      '-vn',
      '-c:a', 'libmp3lame',
      '-b:a', '64k',   // voz com folga; 30s de nota ≈ 240KB
      '-ac', '1',
      '-ar', '44100',  // taxa que nenhum decoder recusa
      '-f', 'mp3',
    ],
    'MP3'
  )
}

/** Formatos que TODO navegador reproduz em <audio>. OGG/Opus nao esta aqui de proposito. */
const REPRODUZ_EM_QUALQUER_NAVEGADOR = new Set(['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-m4a'])

export interface AudioParaWeb {
  buffer: Buffer
  mime: string
  /** Formato em que o audio chegou, quando houve conversao. */
  mimeOriginal?: string
  erro?: string
}

/**
 * Garante que o audio que vai pro storage toca em qualquer navegador.
 *
 * E o ponto unico de decisao: quem grava audio pra exibicao chama isto antes
 * do upload. Formato ja universal passa direto; OGG/Opus, WebM e afins viram
 * MP3. Se a conversao falhar, o original segue (com o erro registrado): o
 * Chrome ainda toca OGG, e e melhor que sumir com a mensagem.
 */
export async function prepararAudioParaWeb(buffer: Buffer, mime: string): Promise<AudioParaWeb> {
  const base = (mime || '').split(';')[0].trim().toLowerCase()
  if (REPRODUZ_EM_QUALQUER_NAVEGADOR.has(base)) return { buffer, mime: base }
  if (jaEhMp3(buffer)) return { buffer, mime: 'audio/mpeg', mimeOriginal: base !== 'audio/mpeg' ? base : undefined }

  const r = await converterParaMp3(buffer)
  if (r.convertido) return { buffer: r.buffer, mime: 'audio/mpeg', mimeOriginal: base || undefined }
  return { buffer, mime: base || 'audio/ogg', erro: r.erro }
}
