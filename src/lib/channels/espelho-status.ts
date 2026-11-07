import { prisma } from '@/lib/db'
import { publishEvent } from '@/lib/realtime'
import { marcarFalhaEnvio } from '@/lib/api/whatsapp'
import { getRedisConnection } from '@/lib/queue/connection'

/**
 * Status (enviada/entregue/lida/falhou) das mensagens da conexao Espelho.
 *
 * O status chega direto, mas a mensagem passa pela fila: o "lida" costuma
 * chegar ANTES de a mensagem existir. Nesse caso ele fica pendente no Redis
 * e o pipeline aplica quando grava a mensagem. Status nunca cria contato nem
 * conversa: so atualiza a mensagem pelo id (wamid).
 */

const READ_STATUS: Record<string, 'sent' | 'delivered' | 'read'> = {
  sent: 'sent',
  delivered: 'delivered',
  read: 'read',
}

// Ordem de "avanco": um status pendente so e trocado por outro mais adiante.
const ORDEM: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 }

const PENDENTE_TTL_S = 60 * 60

const chavePendente = (companyId: string, wamid: string) => `espelho:status-pendente:${companyId}:${wamid}`

/** Aplica o status nas mensagens com esse wamid. Devolve quantas mudou (0 = mensagem ainda nao existe). */
export async function aplicarStatusEspelho(companyId: string, wamid: string, valor: string): Promise<number> {
  const alvos = await prisma.message.findMany({
    where: { uazMessageId: wamid, conversation: { companyId } },
    select: { id: true, conversationId: true },
  })
  if (!alvos.length) return 0

  if (valor === 'failed') {
    for (const m of alvos) await marcarFalhaEnvio(m.id, 'Envio falhou no sistema de origem', { companyId })
    return alvos.length
  }

  const readStatus = READ_STATUS[valor]
  if (!readStatus) return 0
  await prisma.message.updateMany({
    where: { id: { in: alvos.map((m) => m.id) } },
    data: { readStatus, ...(readStatus === 'read' ? { readAt: new Date() } : {}) },
  })
  await Promise.all(
    alvos.map((m) =>
      publishEvent(companyId, {
        type: 'message:update',
        conversationId: m.conversationId,
        messageId: m.id,
        patch: { readStatus, ...(readStatus === 'read' ? { readAt: new Date().toISOString() } : {}) },
      })
    )
  )
  return alvos.length
}

/** Mensagem ainda nao gravada: guarda o status (o mais adiantado) pra aplicar quando ela chegar. */
export async function guardarStatusPendente(companyId: string, wamid: string, valor: string): Promise<void> {
  if (!ORDEM[valor]) return
  try {
    const redis = getRedisConnection()
    const chave = chavePendente(companyId, wamid)
    const atual = await redis.get(chave)
    if (atual && (ORDEM[atual] ?? 0) >= ORDEM[valor]) return
    await redis.set(chave, valor, 'EX', PENDENTE_TTL_S)
  } catch (e) {
    console.warn('[Espelho] nao guardou status pendente:', (e as Error).message)
  }
}

/** Chamado pelo pipeline ao gravar a mensagem: aplica o status que chegou antes dela. */
export async function aplicarStatusPendente(companyId: string, wamid: string): Promise<void> {
  try {
    const redis = getRedisConnection()
    const chave = chavePendente(companyId, wamid)
    const valor = await redis.get(chave)
    if (!valor) return
    await redis.del(chave)
    await aplicarStatusEspelho(companyId, wamid, valor)
  } catch (e) {
    console.warn('[Espelho] nao aplicou status pendente:', (e as Error).message)
  }
}
