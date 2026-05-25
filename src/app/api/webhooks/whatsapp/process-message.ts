/**
 * Inbound message processor — called by the BullMQ inbound-message worker.
 *
 * This re-uses the same webhook handler logic but bypasses the HTTP layer.
 * The webhook route enqueues the raw payload → worker calls this function.
 */

// We dynamically call the validation + processing pipeline that lives in route.ts.
// To avoid duplicating 600+ lines, we call the internal HTTP endpoint via localhost.
// This is efficient because it stays in-process on the same Node.js server.

export async function processInboundMessageFromQueue(
  rawPayload: Record<string, unknown>,
  agentId?: string
): Promise<void> {
  // INTERNAL_APP_URL: rota interna pra worker/server-to-server. Evita round-trip
  // pela URL publica + Nginx + TLS (que custa facil 100-500ms por mensagem).
  // Default 127.0.0.1:${PORT} cobre o caso padrao PM2 single-process; pra worker
  // em maquina separada, setar INTERNAL_APP_URL explicito apontando pro Next.
  const port = process.env.PORT || '3000'
  const appUrl = process.env.INTERNAL_APP_URL || `http://127.0.0.1:${port}`
  // Preserva o agentId da URL original (registrado pelo fluxo multi-agente)
  // pra que o handler interno encontre a instancia correta.
  const url = agentId
    ? `${appUrl}/api/webhooks/whatsapp?agentId=${encodeURIComponent(agentId)}`
    : `${appUrl}/api/webhooks/whatsapp`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-queue-processed': 'true', // Signal to webhook: process synchronously, don't re-enqueue
    },
    body: JSON.stringify(rawPayload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Inbound message processing failed (${response.status}): ${errorText}`)
  }
}
