export interface SendMessageTextRequest {
  phone: string;
  message: string;
  fromAI?: boolean;
  conversationId?: string;
  replyToMessageId?: string;
  linkPreview?: boolean;
  linkPreviewTitle?: string;
  linkPreviewDescription?: string;
  linkPreviewImage?: string;
  linkPreviewLarge?: boolean;
  replyid?: string;
  mentions?: string;
  readchat?: boolean;
  readmessages?: boolean;
  delay?: number;
  forward?: boolean;
  track_source?: string;
  track_id?: string;
}

export interface SendMessageMediaRequest {
  phone: string;
  type: 'image' | 'video' | 'document' | 'audio' | 'myaudio' | 'ptt' | 'sticker';
  file: string;
  text?: string;
  docName?: string;
  fromAI?: boolean;
  conversationId?: string;
  replyToMessageId?: string;
  replyid?: string;
  mentions?: string;
  readchat?: boolean;
  readmessages?: boolean;
  delay?: number;
  forward?: boolean;
  track_source?: string;
  track_id?: string;
}

export interface WhatsAppInstance {
  id: string;
  instance_name: string;
  api_url: string;
  instance_api_key: string;
  company_id: string;
  is_active: boolean;
}

export interface AuthResult {
  agentId: string | null;
  companyId: string | null;
  isSuperAdmin?: boolean;
  /**
   * Chamada do MCP do super-admin (Hermes) pelo loopback, com o token completo.
   * Distingue da chave de API do restaurante (n8n): as rotas de configuracao
   * do MCP (/api/mcp-config) so aceitam escrita por aqui ou pelo admin logado.
   */
  viaMcpAdmin?: boolean;
}
