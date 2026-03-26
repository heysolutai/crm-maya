import { createAdminClient } from '@/lib/supabase/admin';

export async function getAgentSignature(agentId: string | null): Promise<string> {
  if (!agentId) return '';

  const supabase = createAdminClient();

  const { data: userData } = await supabase
    .from('users')
    .select('full_name, settings')
    .eq('id', agentId)
    .single();

  if (!userData) return '';

  const settings = userData.settings as any;
  const signature = settings?.permissions?.message_signature
    || userData.full_name
    || '';

  return signature;
}

export function addSignatureToMessage(messageText: string, signature: string): string {
  if (!signature) return messageText;
  return `${messageText}\n\n_${signature}_`;
}
