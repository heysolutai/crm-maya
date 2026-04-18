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
