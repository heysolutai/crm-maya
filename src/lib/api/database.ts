import { prisma } from '@/lib/db';
import type { WhatsAppInstance } from './types';
import { phoneVariants, canonicalPhone } from './utils';
import { publishEvent } from '@/lib/realtime';

export async function getWhatsAppInstance(companyId: string): Promise<WhatsAppInstance> {
  const instance = await prisma.whatsappInstance.findFirst({
    where: { companyId, isActive: true },
  });

  if (!instance) {
    throw new Error(`WhatsApp instance not found for company ${companyId}`);
  }

  return {
    id: instance.id,
    instance_name: instance.instanceName,
    api_url: instance.apiUrl ?? '',
    instance_api_key: instance.instanceApiKey ?? '',
    company_id: instance.companyId,
    is_active: instance.isActive,
  };
}

export async function findOrCreateConversation(
  phone: string,
  companyId: string
): Promise<string> {
  // Gera todas as variações possíveis (com/sem 9) para match robusto de celulares br
  const variants = phoneVariants(phone);
  const canonical = canonicalPhone(phone);

  // Use transaction to prevent race conditions creating duplicate clients/conversations
  return await prisma.$transaction(async (tx) => {
    const clients = await tx.client.findMany({
      where: {
        companyId,
        OR: [
          { phone: { in: variants } },
          { whatsappLid: { in: variants } },
        ],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 1,
    });

    let client = clients[0] || null;

    if (!client) {
      client = await tx.client.create({
        data: {
          phone: canonical,
          companyId,
          firstName: canonical,
          source: 'whatsapp',
        },
        select: { id: true },
      });
    }

    if (!client) {
      throw new Error('Failed to find or create client');
    }

    let conversation = await tx.conversation.findFirst({
      where: {
        clientId: client.id,
        status: 'active',
      },
      select: { id: true },
      orderBy: { startedAt: 'desc' },
    });

    if (!conversation) {
      conversation = await tx.conversation.create({
        data: {
          clientId: client.id,
          companyId,
          status: 'active',
          channel: 'whatsapp',
          startedAt: new Date(),
        },
        select: { id: true },
    });
  }

    if (!conversation) {
      throw new Error('Failed to find or create conversation');
    }

    return conversation.id;
  }); // end $transaction
}

export async function saveMessage(
  conversationId: string,
  messageText: string,
  messageType: string,
  fromAI: boolean,
  agentId: string | null,
  mediaUrl?: string,
  metadata?: any
) {
  const message = await prisma.message.create({
    data: {
      conversationId,
      senderType: fromAI ? 'ai' : 'agent',
      senderId: fromAI ? null : agentId,
      messageText,
      messageType,
      mediaUrl,
      readStatus: 'sent',
      metadata: {
        ...metadata,
        ai_generated: fromAI,
        processed_by: fromAI ? 'ai_system' : 'agent',
        sent_at: new Date().toISOString(),
      },
    },
  });

  if (!message) {
    console.error('[Database] Error saving message');
    throw new Error('Failed to save message to database');
  }

  // Push realtime pra qualquer browser conectado ao SSE da empresa:
  // agentes/IA vendo a conversa aberta recebem a mensagem imediatamente,
  // em vez de esperar o echo do webhook (segundos depois) ou o polling de 10s.
  // Falha de publish nao quebra a operacao principal.
  try {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { companyId: true },
    });
    if (conv?.companyId) {
      await publishEvent(conv.companyId, {
        type: 'message:new',
        conversationId,
        message: {
          id: message.id,
          conversationId,
          senderType: message.senderType,
          messageText: message.messageText,
          messageType: message.messageType,
          mediaUrl: message.mediaUrl,
          createdAt: message.createdAt,
          metadata: message.metadata,
        },
      });
    }
  } catch (err) {
    console.warn('[saveMessage] publishEvent falhou (nao bloqueante):', (err as Error).message);
  }

  return message;
}

export async function updateMessageMetadata(messageId: string, metadata: any) {
  // Fetch current metadata and merge
  const existing = await prisma.message.findUnique({
    where: { id: messageId },
    select: { metadata: true },
  });
  const merged = { ...((existing?.metadata as any) || {}), ...metadata };
  await prisma.message.update({
    where: { id: messageId },
    data: { metadata: merged as any },
  });
}

export async function getUAZMessageId(messageId: string): Promise<string | null> {
  const data = await prisma.message.findFirst({
    where: { id: messageId },
    select: { uazMessageId: true },
  });

  return data?.uazMessageId || null;
}

export async function getClientPhoneByConversationId(conversationId: string): Promise<string | null> {
  const data = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { clientId: true },
  });

  if (!data?.clientId) return null;

  const client = await prisma.client.findUnique({
    where: { id: data.clientId },
    select: { phone: true },
  });

  return client?.phone || null;
}

export async function assignNextAgent(companyId: string): Promise<string | null> {
  try {
    // Use serializable transaction to prevent race conditions in round-robin
    return await prisma.$transaction(async (tx) => {
      const agents = await tx.user.findMany({
        where: { companyId, isActive: true },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      if (!agents || agents.length === 0) {
        console.log('[Round-Robin] No active agents found for company:', companyId);
        return null;
      }

      const validRoles = ['agent', 'manager', 'company_admin'] as any[];
      const rolesData = await tx.userRole.findMany({
        where: {
          userId: { in: agents.map(a => a.id) },
          role: { in: validRoles },
        },
        select: { userId: true, role: true },
      });

      if (!rolesData || rolesData.length === 0) return null;

      const agentIds = [...new Set(rolesData.map(r => r.userId))].sort();
      if (agentIds.length === 0) return null;

      const state = await tx.leadDistributionState.findFirst({
        where: { companyId, departmentId: null },
        select: { id: true, lastAssignedUserId: true },
      });

      let nextIndex = 0;
      if (state?.lastAssignedUserId) {
        const lastIndex = agentIds.indexOf(state.lastAssignedUserId);
        nextIndex = (lastIndex + 1) % agentIds.length;
      }

      const nextAgentId = agentIds[nextIndex];

      if (state) {
        await tx.leadDistributionState.update({
          where: { id: state.id },
          data: { lastAssignedUserId: nextAgentId },
        });
      } else {
        await tx.leadDistributionState.create({
          data: { companyId, lastAssignedUserId: nextAgentId },
        });
      }

      console.log('[Round-Robin] Assigned agent:', nextAgentId, 'index:', nextIndex, 'of', agentIds.length);
      return nextAgentId;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    console.error('[Round-Robin] Error:', error);
    return null;
  }
}

export async function assignNextAgentInDepartment(
  companyId: string,
  departmentId: string
): Promise<string | null> {
  try {
    // Use serializable transaction to prevent race conditions in round-robin
    return await prisma.$transaction(async (tx) => {
      const members = await tx.departmentMember.findMany({
        where: { departmentId },
        select: { userId: true },
      });

      if (!members || members.length === 0) {
        console.log('[Dept Round-Robin] No members in department:', departmentId);
        return null;
      }

      const memberUserIds = members.map(m => m.userId);

      const onlineAgents = await tx.user.findMany({
        where: {
          id: { in: memberUserIds },
          companyId,
          isActive: true,
          isOnline: true,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      if (!onlineAgents || onlineAgents.length === 0) {
        console.log('[Dept Round-Robin] No online active agents in department:', departmentId);
        return null;
      }

      const validRoles = ['agent', 'manager', 'company_admin'] as any[];
      const rolesData = await tx.userRole.findMany({
        where: {
          userId: { in: onlineAgents.map(a => a.id) },
          role: { in: validRoles },
        },
        select: { userId: true, role: true },
      });

      if (!rolesData || rolesData.length === 0) return null;

      const agentIds = [...new Set(rolesData.map(r => r.userId))].sort();
      if (agentIds.length === 0) return null;

      const state = await tx.leadDistributionState.findFirst({
        where: { companyId, departmentId },
        select: { id: true, lastAssignedUserId: true },
      });

      let nextIndex = 0;
      if (state?.lastAssignedUserId) {
        const lastIndex = agentIds.indexOf(state.lastAssignedUserId);
        nextIndex = (lastIndex + 1) % agentIds.length;
      }

      const nextAgentId = agentIds[nextIndex];

      if (state) {
        await tx.leadDistributionState.update({
          where: { id: state.id },
          data: { lastAssignedUserId: nextAgentId, updatedAt: new Date() },
        });
      } else {
        await tx.leadDistributionState.create({
          data: { companyId, departmentId, lastAssignedUserId: nextAgentId, updatedAt: new Date() },
        });
      }

      console.log('[Dept Round-Robin] Assigned agent:', nextAgentId, 'in dept:', departmentId, 'index:', nextIndex, 'of', agentIds.length);
      return nextAgentId;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    console.error('[Dept Round-Robin] Error:', error);
    return null;
  }
}

export async function pauseClientAIByConversation(conversationId: string): Promise<boolean> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { clientId: true },
    });

    if (!conversation?.clientId) {
      console.warn('[AI Pause] No client found for conversation:', conversationId);
      return false;
    }

    await prisma.client.update({
      where: { id: conversation.clientId },
      data: { aiPaused: true },
    });

    console.log('[AI Pause] AI automatically paused for client:', conversation.clientId);
    return true;
  } catch (error) {
    console.error('[AI Pause] Exception:', error);
    return false;
  }
}
