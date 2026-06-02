export type ConversationStatus = 'active' | 'pending' | 'closed';

export const statusColors: Record<ConversationStatus, string> = {
  active: 'bg-green-500',
  pending: 'bg-yellow-500',
  closed: 'bg-gray-500',
};

export const statusLabels: Record<ConversationStatus, string> = {
  active: 'Ativa',
  pending: 'Pendente',
  closed: 'Fechada',
};

export interface Message {
  id: string;
  conversation_id: string;
  message_text: string | null;
  message_type: string | null;
  media_url: string | null;
  sender_type: 'client' | 'ai' | 'agent' | 'system';
  sender_id: string | null;
  sender?: {
    full_name: string | null;
  } | null;
  created_at: string | null;
  is_read: boolean | null;
  read_at: string | null;
  read_status: string | null;
  quoted_message_id: string | null;
  uaz_message_id: string | null;
  metadata: Record<string, any> | null;
}

export interface Client {
  id: string;
  first_name: string;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  ai_paused?: boolean | null;
}

export interface LastMessage {
  text: string | null;
  type: string;
  sender_type: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  status: ConversationStatus;
  started_at: string;
  client: Client | null;
  tags: string[] | null;
  transferred_user?: {
    full_name: string | null;
  } | null;
  department_id?: string | null;
  department?: {
    id: string;
    name: string;
    color: string;
  } | null;
  unread_count?: number;
  last_message?: LastMessage | null;
}

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  is_online?: boolean;
  avatar_url?: string | null;
}

export interface QuotedMessage {
  id: string;
  message_text: string | null;
  message_type: string | null;
  sender_type: string;
  sender?: {
    full_name: string | null;
  } | null;
}

export interface TypingAgent {
  userId: string;
  userName: string;
  timestamp: number;
}

export const getInitials = (name: string): string => {
  const parts = name.split(' ');
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.substring(0, 2).toUpperCase();
};

/**
 * Mascarar telefone preservando inicio e final. Privacidade na lista.
 *  - Brasileiro (12-13 digitos): "+55 62 8****-8103"
 *  - Outros formatos: mantem 1o e ultimos 4, mascarado no meio
 *  - Input invalido: retorna o original
 */
export const formatPhoneMasked = (phone: string | null | undefined): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return phone;

  // Brasileiro: 55 + DDD(2) + 9(?) + numero(8)
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    const country = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    // rest = 8 ou 9 digitos. Mostra 1o, mascara 4 do meio, mostra ultimos 4
    const first = rest[0];
    const last4 = rest.slice(-4);
    return `+${country} ${ddd} ${first}****-${last4}`;
  }

  // Fallback generico: mostra primeiros 3 + ultimos 4, mascara meio
  const first = digits.slice(0, 3);
  const last4 = digits.slice(-4);
  return `+${first}****${last4}`;
};

export type ConversationStatusInfo = {
  label: string;
  variant: 'pending' | 'ai' | 'human' | 'closed';
};

/**
 * Mapeia o estado da conversa pro badge de status mostrado na lista.
 * Centraliza a logica pra qualquer view renderizar igual.
 */
export const getConversationStatusInfo = (conv: {
  status?: string;
  transferred_user?: { full_name?: string | null } | null;
}): ConversationStatusInfo => {
  if (conv.status === 'closed') {
    return { label: 'Encerrada', variant: 'closed' };
  }
  if (conv.status === 'pending') {
    return { label: 'Aguardando humano', variant: 'pending' };
  }
  if (conv.transferred_user) {
    const name = conv.transferred_user.full_name || 'humano';
    return { label: `Atendendo: ${name.split(' ')[0]}`, variant: 'human' };
  }
  return { label: 'IA atendendo', variant: 'ai' };
};
