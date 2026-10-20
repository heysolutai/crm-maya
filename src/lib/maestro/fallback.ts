import { prisma } from '@/lib/db'
import { pauseClientAI } from '@/lib/ai/pause'
import { motivoCurto, precisaDoSuporte } from '@/lib/ai/motivos'
import { logConversationEvent } from '@/lib/conversations/events'
import { publishEvent } from '@/lib/realtime'
import { getRedisConnection } from '@/lib/queue/connection'
import { enviarTexto, type DestinoEnvio } from './enviar'

/**
 * Falha da IA = passa pra um humano. Nunca silencio e nunca erro cru ao
 * cliente: o cliente recebe UMA frase curta e a conversa vai pra fila dos
 * atendentes com a IA pausada (sem prazo) ate alguem retomar.
 */

/** Uma mensagem de "vou chamar um atendente" por conversa a cada 10 minutos. */
const JANELA_MENSAGEM_S = 10 * 60

/**
 * Reserva o direito de avisar o cliente. true = pode enviar. Sem Redis (ou erro
 * nele) libera: o pior caso e uma mensagem repetida, e a IA ja fica pausada
 * depois da primeira, entao nao ha rajada.
 */
export async function podeAvisarCliente(conversationId: string): Promise<boolean> {
  try {
    const ok = await getRedisConnection().set(`maestro:aviso-falha:${conversationId}`, '1', 'EX', JANELA_MENSAGEM_S, 'NX')
    return ok === 'OK'
  } catch (err) {
    console.warn('[maestro] limite de aviso indisponivel; enviando:', (err as Error)?.message)
    return true
  }
}

export interface PassarParaHumanoInput {
  companyId: string
  conversationId: string
  clientId: string | null
  clientName: string | null
  /** Texto curto e fixo do motivo (so metadata do evento). */
  motivo: string
}

/** A mesma nota nao se repete na conversa dentro desta janela. */
const JANELA_NOTA_MS = 10 * 60 * 1000

/** Texto da nota interna: por que a conversa caiu na fila, em palavras simples. */
export function textoNotaFalha(motivo: string): string {
  const suporte = precisaDoSuporte(motivo) ? ' Avise o suporte para resolver o problema da IA.' : ''
  return (
    `A IA não conseguiu responder este cliente (${motivoCurto(motivo)}). A conversa foi passada para a equipe.` +
    ` Responda o cliente por aqui; quando a IA puder voltar, clique em "Retomar IA".` +
    suporte
  )
}

/**
 * Nota interna na conversa (aparece no chat do atendente, em tempo real) pra
 * quem pegar a conversa entender por que ela chegou na fila. Sem autor
 * (createdBy null) = nota do sistema. Nunca lanca.
 */
async function registrarNotaFalha(p: PassarParaHumanoInput): Promise<void> {
  try {
    const note = textoNotaFalha(p.motivo)
    const repetida = await prisma.conversationNote.findFirst({
      where: {
        companyId: p.companyId,
        conversationId: p.conversationId,
        createdBy: null,
        note,
        createdAt: { gte: new Date(Date.now() - JANELA_NOTA_MS) },
      },
      select: { id: true },
    })
    if (repetida) return

    const noteRecord = await prisma.conversationNote.create({
      data: { companyId: p.companyId, conversationId: p.conversationId, createdBy: null, note },
      include: { creator: { select: { fullName: true, avatarUrl: true } } },
    })
    await publishEvent(p.companyId, { type: 'note:new', conversationId: p.conversationId, note: noteRecord })
  } catch (err) {
    console.error('[maestro] falha ao registrar a nota da transferencia:', (err as Error)?.message)
  }
}

/**
 * Conversa vai pra fila dos atendentes: status pending, sem atendente, IA
 * pausada sem prazo, evento 'handoff_human' (metrica), nota interna com o
 * motivo e aviso em tempo real.
 * Cada passo e independente: um falhar nao impede os outros.
 */
export async function passarParaHumano(p: PassarParaHumanoInput): Promise<void> {
  try {
    await prisma.conversation.updateMany({
      // Conversa encerrada nao reabre sozinha por falha da IA.
      where: { id: p.conversationId, companyId: p.companyId, status: { not: 'closed' } },
      data: { status: 'pending', transferredTo: null, aiHandled: false, updatedAt: new Date() },
    })
  } catch (err) {
    console.error('[maestro] falha ao mover conversa pra fila:', (err as Error)?.message)
  }

  if (p.clientId) {
    try {
      await pauseClientAI({
        companyId: p.companyId,
        clientId: p.clientId,
        conversationId: p.conversationId,
        actor: 'system',
        minutes: null,
      })
    } catch (err) {
      console.error('[maestro] falha ao pausar a IA:', (err as Error)?.message)
    }
  }

  await logConversationEvent({
    companyId: p.companyId,
    conversationId: p.conversationId,
    type: 'handoff_human',
    actor: 'system',
    metadata: { source: 'maestro_fallback', motivo: p.motivo.slice(0, 200) },
  })

  await registrarNotaFalha(p)

  await publishEvent(p.companyId, {
    type: 'conversation:transferred',
    conversationId: p.conversationId,
    targetUserId: null,
    status: 'pending',
    clientName: p.clientName,
  })
}

/**
 * Falha de vez: avisa o cliente (no maximo uma vez a cada 10 min) e passa pra
 * humano. Devolve o texto enviado ao cliente, ou null se nao enviou.
 * `destino` null = nao ha como enviar (canal sem adapter / sem telefone).
 */
export async function falharParaHumano(
  p: PassarParaHumanoInput & { destino: DestinoEnvio | null; mensagem: string; avisar: boolean }
): Promise<string | null> {
  // Primeiro a fila: a equipe precisa saber mesmo se o envio abaixo travar.
  await passarParaHumano(p)

  if (!p.avisar || !p.destino) return null
  if (!(await podeAvisarCliente(p.conversationId))) return null
  try {
    await enviarTexto(p.destino, p.mensagem)
    return p.mensagem
  } catch (err) {
    console.error('[maestro] falha ao enviar o aviso de transferencia:', (err as Error)?.message)
    return null
  }
}
