/**
 * Tempo medio (min) entre a mensagem do cliente e a 1a resposta.
 * `responder` restringe a resposta a IA ou a humano; sem ele, qualquer um.
 *
 * Roda no servidor (antes rodava no browser so com as mensagens de hoje):
 * assim respeita o periodo do filtro sem mandar a lista de mensagens pro
 * cliente. `messages` precisa vir ordenado por createdAt asc.
 */
export interface ResponseTimeMessage {
  conversationId: string
  senderType: string
  createdAt: Date
}

export function computeAvgResponseTime(
  messages: ResponseTimeMessage[],
  responder?: 'ai' | 'agent'
): number {
  const byConversation = new Map<string, ResponseTimeMessage[]>()
  for (const msg of messages) {
    const arr = byConversation.get(msg.conversationId) ?? []
    arr.push(msg)
    byConversation.set(msg.conversationId, arr)
  }

  // Mede a 1a resposta do `responder` contra a mensagem de cliente que ela
  // de fato respondeu (a primeira sem resposta desde a ultima resposta de
  // qualquer um). Sem isso, num fluxo IA-first o tempo do atendente incluia
  // toda a fase em que a IA estava cuidando da conversa.
  const responseTimes: number[] = []
  for (const [, msgs] of byConversation) {
    let pendingClientAt: number | null = null
    for (const m of msgs) {
      const at = m.createdAt.getTime()
      if (m.senderType === 'client') {
        if (pendingClientAt === null) pendingClientAt = at
        continue
      }
      if (m.senderType !== 'ai' && m.senderType !== 'agent') continue
      if (pendingClientAt === null) continue
      if (!responder || m.senderType === responder) {
        const diffMin = (at - pendingClientAt) / 60000
        if (diffMin > 0 && diffMin < 1440) responseTimes.push(diffMin)
        break
      }
      // Resposta do outro lado: a pendencia foi atendida por ele.
      pendingClientAt = null
    }
  }

  return responseTimes.length > 0
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
    : 0
}
