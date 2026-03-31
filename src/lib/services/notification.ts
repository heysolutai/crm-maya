/**
 * Notification service
 *
 * Delivers in-app, push, or email notifications for key CRM events.
 * All functions are currently stubs that log to the console.
 *
 * TODO: implement real delivery channels:
 *   - Push notifications (e.g. Firebase FCM, Web Push)
 *   - Email (e.g. Resend, SendGrid, Nodemailer)
 *   - In-app notification records via Prisma
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NewConversationParams {
  companyId: string
  clientName: string
  channel: string
}

export interface ConversationTransferredParams {
  companyId: string
  fromAgentId: string
  toAgentId: string
  conversationId: string
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Notify relevant parties that a new conversation has been started.
 *
 * Typical triggers: inbound WhatsApp message from an unknown contact,
 * or a manually created conversation from the UI.
 *
 * TODO: send a push / email notification to the company's online agents.
 *
 * @param params  Company context, client display name and originating channel.
 * @param _tx     Reserved for future Prisma transaction propagation.
 */
export async function notifyNewConversation(
  params: NewConversationParams,
  _tx?: unknown
): Promise<void> {
  // TODO: implement push/email notification for new conversation.
  console.log('[NOTIFICATION] New conversation', JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'NEW_CONVERSATION',
    companyId: params.companyId,
    clientName: params.clientName,
    channel: params.channel,
  }))
}

/**
 * Notify the receiving agent that a conversation has been transferred to them.
 *
 * TODO: send a real-time notification (WebSocket, push, email) to `toAgentId`.
 *
 * @param params  Company context, source/destination agent IDs, and the conversation.
 * @param _tx     Reserved for future Prisma transaction propagation.
 */
export async function notifyConversationTransferred(
  params: ConversationTransferredParams,
  _tx?: unknown
): Promise<void> {
  // TODO: implement push/email notification for conversation transfer.
  console.log('[NOTIFICATION] Conversation transferred', JSON.stringify({
    timestamp: new Date().toISOString(),
    event: 'CONVERSATION_TRANSFERRED',
    companyId: params.companyId,
    fromAgentId: params.fromAgentId,
    toAgentId: params.toAgentId,
    conversationId: params.conversationId,
  }))
}
