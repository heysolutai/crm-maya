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
  rawPayload: Record<string, unknown>
): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Call the webhook endpoint internally with a special header to skip re-enqueue
  const response = await fetch(`${appUrl}/api/webhooks/whatsapp`, {
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
