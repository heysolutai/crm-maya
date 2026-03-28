import { prisma } from '@/lib/db';

export async function getAgentSignature(agentId: string | null): Promise<string> {
  if (!agentId) return '';

  const userData = await prisma.user.findUnique({
    where: { id: agentId },
    select: { fullName: true, settings: true },
  });

  if (!userData) return '';

  const settings = userData.settings as any;
  const signature = settings?.permissions?.message_signature
    || userData.fullName
    || '';

  return signature;
}

export function addSignatureToMessage(messageText: string, signature: string): string {
  if (!signature) return messageText;
  return `${messageText}\n\n_${signature}_`;
}
