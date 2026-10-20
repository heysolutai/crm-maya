import { prisma } from '@/lib/db'

/**
 * Historico da conversa no formato do modelo (chat completions).
 *
 *   cliente                  -> user
 *   IA / atendente           -> assistant
 *   sistema (lembrete etc.)  -> fora (nao e fala; ver `incluirSistema`)
 *
 * Audio ja chega transcrito em messageText (transcription worker). Midia sem
 * texto vira marcador ("[imagem]"): sem ele a IA "nao via" a foto e pedia de
 * novo o que o cliente ja tinha mandado. Mensagens seguidas do mesmo papel sao
 * juntas numa so (o cliente que escreve picado vira um bloco, e a API aceita
 * melhor); vazias saem.
 */

export const LIMITE_HISTORICO = 30
const LIMITE_TEXTO_MENSAGEM = 2000

export interface LinhaMensagem {
  id?: string
  senderType: string
  messageText: string | null
  messageType: string | null
  createdAt: Date
}

export interface MensagemChat {
  role: 'user' | 'assistant'
  content: string
}

const NOME_MIDIA: Record<string, string> = {
  image: 'imagem',
  video: 'vídeo',
  audio: 'áudio',
  ptt: 'áudio',
  voice: 'áudio',
  document: 'documento',
  sticker: 'figurinha',
  location: 'localização',
  contact: 'contato',
  contacts: 'contato',
}

const TIPOS_TEXTO = ['text', 'chat', 'conversation', 'extendedtextmessage']
const TIPOS_AUDIO = ['audio', 'ptt', 'voice']

/**
 * Texto que representa a mensagem pro modelo, ou null quando nao ha nada a
 * dizer (mensagem vazia). Falha de transcricao grava um placeholder entre
 * colchetes ("[Audio - transcricao falhou]"): nao vale como fala do cliente.
 */
export function textoDaMensagem(m: Pick<LinhaMensagem, 'messageText' | 'messageType'>): string | null {
  const tipo = (m.messageType || 'text').toLowerCase()
  const texto = (m.messageText || '').trim().slice(0, LIMITE_TEXTO_MENSAGEM)
  if (TIPOS_TEXTO.includes(tipo)) return texto || null

  const nome = NOME_MIDIA[tipo] ?? 'arquivo'
  if (TIPOS_AUDIO.includes(tipo)) {
    return texto && !texto.startsWith('[') ? texto : `[${nome}]`
  }
  // Foto/documento/video: legenda (se tiver) depois do marcador.
  return texto && !texto.startsWith('[') ? `[${nome}] ${texto}` : `[${nome}]`
}

export function montarHistorico(
  linhas: LinhaMensagem[],
  opcoes: { limite?: number; incluirSistema?: boolean } = {}
): MensagemChat[] {
  const limite = opcoes.limite ?? LIMITE_HISTORICO
  const saida: MensagemChat[] = []
  for (const m of linhas.slice(-limite)) {
    if (m.senderType === 'system' && !opcoes.incluirSistema) continue
    const texto = textoDaMensagem(m)
    if (!texto) continue
    const role: MensagemChat['role'] = m.senderType === 'client' ? 'user' : 'assistant'
    const ultima = saida[saida.length - 1]
    if (ultima && ultima.role === role) ultima.content += `\n${texto}`
    else saida.push({ role, content: texto })
  }
  return saida
}

/**
 * Ultimas mensagens da conversa, da mais antiga pra mais nova. Filtra pela
 * empresa na propria query (a conversa e conferida por quem chama, mas o
 * filtro fica aqui tambem: nunca le mensagem de outro restaurante).
 */
export async function carregarLinhas(
  companyId: string,
  conversationId: string,
  limite: number = LIMITE_HISTORICO
): Promise<LinhaMensagem[]> {
  const linhas = await prisma.message.findMany({
    where: { conversationId, conversation: { companyId } },
    orderBy: { createdAt: 'desc' },
    take: limite,
    select: { id: true, senderType: true, messageText: true, messageType: true, createdAt: true },
  })
  return linhas.reverse()
}

/** Playground: mensagens do formulario -> historico (sem banco). */
export function historicoSimulado(msgs: { role: 'user' | 'assistant'; content: string }[]): MensagemChat[] {
  const saida: MensagemChat[] = []
  for (const m of msgs) {
    const texto = m.content.trim().slice(0, LIMITE_TEXTO_MENSAGEM)
    if (!texto) continue
    const ultima = saida[saida.length - 1]
    if (ultima && ultima.role === m.role) ultima.content += `\n${texto}`
    else saida.push({ role: m.role, content: texto })
  }
  return saida
}

/**
 * Ha mensagem do cliente ainda sem texto (audio esperando transcricao)? O
 * turno espera um pouco: responder agora seria responder "[áudio]".
 */
const PLACEHOLDER_TRANSCREVENDO = /^\[\s*[aá]udio\s*-\s*transcrevendo/i

export function temTranscricaoPendente(linhas: LinhaMensagem[], agora: number = Date.now(), maxIdadeMs = 90_000): boolean {
  return linhas.some(
    (m) =>
      m.senderType === 'client' &&
      PLACEHOLDER_TRANSCREVENDO.test((m.messageText || '').trim()) &&
      agora - m.createdAt.getTime() < maxIdadeMs
  )
}
