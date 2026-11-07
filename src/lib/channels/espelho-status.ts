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

/**
 * Aplica o status nas mensagens com esse wamid. Devolve quantas EXISTEM
 * (0 = ainda nao gravada: o status fica pendente).
 */
export async function aplicarStatusEspelho(companyId: string, wamid: string, valor: string): Promise<number> {
  const alvos = await prisma.message.findMany({
    where: { uazMessageId: wamid, conversation: { companyId } },
    select: { id: true, conversationId: true, readStatus: true },
  })
  if (!alvos.length) return 0

  if (valor === 'failed') {
    for (const m of alvos) await marcarFalhaEnvio(m.id, 'Envio falhou no sistema de origem', { companyId })
    return alvos.length
  }

  const readStatus = READ_STATUS[valor]
  if (!readStatus) return alvos.length
  // So avanca: um "entregue" reenviado (o sistema de origem reenvia por ate 2 h)
  // depois do "lida" nao rebaixa a mensagem nem a tela aberta.
  const avancam = alvos.filter((m) => !m.readStatus || (ORDEM[m.readStatus] ?? 0) < ORDEM[readStatus])
  if (!avancam.length) return alvos.length

  await prisma.message.updateMany({
    where: { id: { in: avancam.map((m) => m.id) } },
    data: { readStatus, ...(readStatus === 'read' ? { readAt: new Date() } : {}) },
  })
  await Promise.all(
    avancam.map((m) =>
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

/**
 * Mensagem ainda nao gravada: guarda o status (o mais adiantado) e confere
 * DE NOVO. Os dois lados gravam primeiro e conferem depois (aqui: guarda o
 * status e procura a mensagem; no pipeline: grava a mensagem e procura o
 * status), entao um sempre enxerga o outro. Sem isso, a mensagem podia ser
 * gravada entre a busca e o "guardar", e o status ficava esquecido.
 */
export async function guardarStatusPendente(companyId: string, wamid: string, valor: string): Promise<void> {
  if (!ORDEM[valor]) return
  try {
    const redis = getRedisConnection()
    const chave = chavePendente(companyId, wamid)
    const atual = await redis.get(chave)
    if (!atual || (ORDEM[atual] ?? 0) < ORDEM[valor]) await redis.set(chave, valor, 'EX', PENDENTE_TTL_S)
  } catch (e) {
    console.warn('[Espelho] nao guardou status pendente:', (e as Error).message)
    return
  }
  await aplicarStatusPendente(companyId, wamid)
}

/**
 * Aplica o status pendente, se a mensagem ja existir. Chamado pelo pipeline
 * ao gravar a mensagem e pelo guardarStatusPendente (segunda conferencia).
 * So apaga a pendencia depois de aplicar de verdade.
 */
export async function aplicarStatusPendente(companyId: string, wamid: string): Promise<void> {
  try {
    const redis = getRedisConnection()
    const chave = chavePendente(companyId, wamid)
    const valor = await redis.get(chave)
    if (!valor) return
    const aplicadas = await aplicarStatusEspelho(companyId, wamid, valor)
    if (aplicadas > 0) await redis.del(chave)
  } catch (e) {
    console.warn('[Espelho] nao aplicou status pendente:', (e as Error).message)
  }
}
