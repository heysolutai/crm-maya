/**
 * Registry de adapters por canal. Quando uma rota precisa operar um agente,
 * ela busca aqui o adapter correspondente ao channelType do agente.
 */

import type { ChannelType } from './types';
import type { ChannelAdapter } from './adapter';
import { evolutionBaileysAdapter } from './adapters/evolution-baileys';
import { uazapiAdapter } from './adapters/uazapi';
import { notificameAdapter } from './adapters/notificame';

const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {
  uazapi: uazapiAdapter,
  evolution_baileys: evolutionBaileysAdapter,
  notificame: notificameAdapter,
};

export function getAdapter(channelType: ChannelType): ChannelAdapter {
  const adapter = adapters[channelType];
  if (!adapter) {
    throw new Error(`Adapter nao implementado para canal: ${channelType}`);
  }
  return adapter;
}

export function hasAdapter(channelType: ChannelType): boolean {
  return Boolean(adapters[channelType]);
}
