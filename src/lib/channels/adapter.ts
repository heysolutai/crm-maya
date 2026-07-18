/**
 * Contrato comum para todos os canais (UazAPI, Evolution, Z-API, WA Cloud, Instagram).
 *
 * Cada canal implementa este adapter. As rotas de API e o webhook receiver
 * trabalham apenas com a interface — nunca falam com o provider direto.
 *
 * Convencoes:
 * - "agent" e a linha em whatsapp_instances. Contem credenciais e estado.
 * - Metodos que falham por erro do provider devem lancar Error com mensagem
 *   util pra exibir ao usuario (sem vazar tokens).
 */

import type { ChannelType } from './types';

/**
 * Forma simplificada do agente passada aos adapters. Nao expomos o objeto
 * completo do Prisma pra evitar acoplamento.
 */
export interface ChannelAgent {
  id: string;
  companyId: string;
  channelType: ChannelType;
  instanceName: string;
  displayName: string | null;
  phoneNumber: string | null;
  apiUrl: string | null;
  instanceApiKey: string | null;
  channelConfig: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
}

/**
 * Inputs do usuario coletados no dialog de "Novo Agente". Cada canal pode
 * exigir campos diferentes — o adapter decide o que usar.
 */
export interface ProvisionInput {
  companyId: string;
  displayName: string;
  /** URL do servidor (Evolution self-hosted, UazAPI custom, etc) */
  serverUrl?: string;
  /** Token global/admin do servidor (Evolution AUTHENTICATION_API_KEY, UazAPI admin) */
  serverApiKey?: string;
  /** Numero de telefone esperado (opcional — alguns canais usam pra pairing code) */
  phoneNumber?: string;
  /** URL publica que vai receber webhooks deste agente */
  webhookUrl: string;
  /** Campos extras especificos do canal */
  extra?: Record<string, unknown>;
}

/**
 * Inputs para ADOTAR uma instancia que JA EXISTE no provider — o usuario cola
 * o token dela em vez de criar uma nova.
 *
 * Diferenca chave pro provision: aqui nao criamos nada no provider. Precisamos
 * descobrir o `instanceName` real consultando o provider com o token, porque o
 * receiver de webhook resolve a inbox por esse nome — se gravarmos um nome
 * inventado, as mensagens recebidas nunca casam com a inbox.
 */
export interface AdoptInput {
  companyId: string;
  displayName: string;
  /** URL do servidor do provider */
  serverUrl?: string;
  /** Token DA INSTANCIA existente (nao e o admin token) */
  instanceToken: string;
  /** URL publica que vai receber webhooks deste agente */
  webhookUrl: string;
  extra?: Record<string, unknown>;
}

/**
 * Retorno do provision: dados que sao gravados no whatsapp_instances pro
 * adapter conseguir operar nas chamadas seguintes.
 */
export interface ProvisionResult {
  /** Nome/ID da instancia no provider (ex: hash.instance.instanceName no Evolution) */
  providerInstanceName: string;
  /** API key especifica desta instancia (ex: hash.apikey no Evolution) */
  instanceApiKey: string | null;
  /** URL base do provider (echo do input pra simplificar leitura depois) */
  apiUrl: string;
  /** Config a ser persistida em channel_config (ex: serverApiKey criptografado) */
  channelConfig: Record<string, unknown>;
  /** Metadata do provider (resposta crua do create — util pra debug) */
  metadata: Record<string, unknown>;
  /** QR code base64 ja disponivel? (alguns providers retornam logo no create) */
  qrCode?: string | null;
  /** Pairing code alternativo (Evolution retorna esse junto com o QR) */
  pairingCode?: string | null;
}

export interface QrResult {
  /** String base64 do QR (data URL ou puro). Null se ja conectou. */
  qrCode: string | null;
  /** Pairing code alternativo */
  pairingCode?: string | null;
  /** Status atual apos a tentativa */
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export interface StatusResult {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  phoneNumber?: string | null;
  raw?: Record<string, unknown>;
}

export interface SendTextInput {
  to: string;
  text: string;
  quotedMessageId?: string;
}

export interface SendTextResult {
  /** ID da mensagem no provider — util pra dedup em webhook */
  providerMessageId: string;
  status: 'sent' | 'pending' | 'failed';
  raw?: Record<string, unknown>;
}

export interface ChannelAdapter {
  type: ChannelType;

  /** Cria a instancia no provider. Chamado quando POST /api/agents */
  provision(input: ProvisionInput): Promise<ProvisionResult>;

  /**
   * Adota uma instancia ja existente no provider a partir do token dela.
   * Opcional: canais que nao suportam esse fluxo simplesmente nao implementam
   * (a rota responde com erro amigavel).
   */
  adopt?(input: AdoptInput): Promise<ProvisionResult>;

  /** Retorna QR atual (gera novo se necessario) */
  getQrCode(agent: ChannelAgent): Promise<QrResult>;

  /** Polling de status — chamado pela UI durante "connecting" */
  getStatus(agent: ChannelAgent): Promise<StatusResult>;

  /** Logout da sessao (mantem instancia) */
  disconnect(agent: ChannelAgent): Promise<void>;

  /** Remove instancia do provider (chamado em DELETE /api/agents) */
  remove(agent: ChannelAgent): Promise<void>;

  /** Envia mensagem de texto */
  sendText(agent: ChannelAgent, input: SendTextInput): Promise<SendTextResult>;
}
