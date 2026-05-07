/**
 * Canais suportados pelos agentes. Cada agente (linha em whatsapp_instances)
 * tem um channelType que determina qual adapter sera usado para conexao,
 * envio de mensagens e parsing de webhooks.
 *
 * Hoje so o adapter de uazapi esta implementado — os outros aparecem na UI
 * com label "Em breve" ate o codigo do canal ser entregue.
 */
export const CHANNEL_TYPES = [
  'uazapi',
  'evolution_baileys',
  'evolution_go',
  'zapi',
  'whatsapp_cloud',
  'instagram',
] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];

export type ChannelStatus = 'available' | 'coming_soon';

export interface ChannelMeta {
  type: ChannelType;
  label: string;
  description: string;
  status: ChannelStatus;
  /** Tipo de fluxo de conexao — define qual UI/dialog renderizar */
  connectionMode: 'qr' | 'oauth' | 'token';
}

export const CHANNEL_REGISTRY: Record<ChannelType, ChannelMeta> = {
  uazapi: {
    type: 'uazapi',
    label: 'UazAPI',
    description: 'WhatsApp via UazAPI — conexao por QR Code',
    status: 'available',
    connectionMode: 'qr',
  },
  evolution_baileys: {
    type: 'evolution_baileys',
    label: 'Evolution Baileys',
    description: 'WhatsApp via Evolution API (Baileys/Node) — QR Code',
    status: 'available',
    connectionMode: 'qr',
  },
  evolution_go: {
    type: 'evolution_go',
    label: 'Evolution GO',
    description: 'WhatsApp via Evolution API (Go) — QR Code',
    status: 'coming_soon',
    connectionMode: 'qr',
  },
  zapi: {
    type: 'zapi',
    label: 'Z-API',
    description: 'WhatsApp via Z-API — QR Code',
    status: 'coming_soon',
    connectionMode: 'qr',
  },
  whatsapp_cloud: {
    type: 'whatsapp_cloud',
    label: 'WhatsApp Cloud',
    description: 'WhatsApp Business Cloud API (Meta) — token oficial',
    status: 'coming_soon',
    connectionMode: 'oauth',
  },
  instagram: {
    type: 'instagram',
    label: 'Instagram',
    description: 'Instagram Direct via Meta Graph API',
    status: 'coming_soon',
    connectionMode: 'oauth',
  },
};

export function isChannelType(v: string): v is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(v);
}
