/**
 * Helpers de redacao de segredos em respostas de API.
 *
 * Regra: segredos (chaves de API, tokens) NUNCA devem ir pro cliente. Quando
 * um endpoint de leitura devolve um registro que contem segredo, o valor e
 * substituido por REDACTED. Quando o cliente devolve esse mesmo valor num
 * update, o servidor entende "nao mudou" e preserva o segredo original.
 */

export const REDACTED = '__REDACTED__';

const AI_SECRET_KEYS = ['openai', 'anthropic', 'gemini', 'elevenlabs'] as const;

/**
 * Redige as chaves secretas do Json `apiKeys` do AiAgent, preservando os
 * ajustes NAO-secretos (audio/voz/provider: elevenlabs_stability, voice_id, etc).
 */
export function redactAiApiKeys(apiKeys: unknown): Record<string, unknown> {
  if (!apiKeys || typeof apiKeys !== 'object') return {};
  const out: Record<string, unknown> = { ...(apiKeys as Record<string, unknown>) };
  for (const k of AI_SECRET_KEYS) {
    if (typeof out[k] === 'string' && (out[k] as string).length > 0) out[k] = REDACTED;
  }
  return out;
}

/**
 * Mescla o `apiKeys` recebido do cliente com o que ja existe no banco,
 * preservando segredos que voltaram redigidos (REDACTED) ou vazios. So
 * sobrescreve um segredo quando o cliente manda um valor novo de verdade.
 */
export function mergeAiApiKeys(incoming: unknown, existing: unknown): Record<string, unknown> {
  const inc = (incoming && typeof incoming === 'object' ? incoming : {}) as Record<string, unknown>;
  const cur = (existing && typeof existing === 'object' ? existing : {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...cur, ...inc };
  for (const k of AI_SECRET_KEYS) {
    const v = inc[k];
    if (v === REDACTED || v === undefined || v === null || v === '') {
      merged[k] = cur[k];
    }
  }
  return merged;
}

/** Mascara uma chave mostrando so os ultimos 4 chars (ex: "••••X5UA"). null se vazia. */
export function maskKey(key: unknown): string | null {
  if (typeof key !== 'string' || key.length === 0) return null;
  if (key.length <= 4) return '••••';
  return '••••' + key.slice(-4);
}

/** Nomes de campo que NUNCA podem sair pro navegador, em qualquer nivel. */
const CAMPOS_SECRETOS = [
  'serverapikey',
  'channeltoken',
  'admintoken',
  'instanceapikey',
  'apikey',
  'token',
  'apitoken',
  'secret',
  'password',
  'authorization',
  'hash',
];

/** Redige subcampos secretos conhecidos do channelConfig de uma Inbox, mantendo o resto. */
export function redactChannelConfig(cfg: unknown): unknown {
  if (!cfg || typeof cfg !== 'object') return cfg ?? null;
  const SECRET_SUBFIELDS = ['serverApiKey', 'channelToken', 'adminToken', 'instanceApiKey', 'apiKey', 'token'];
  const out: Record<string, unknown> = { ...(cfg as Record<string, unknown>) };
  for (const k of SECRET_SUBFIELDS) {
    if (typeof out[k] === 'string' && (out[k] as string).length > 0) out[k] = REDACTED;
  }
  return out;
}

/**
 * Redige segredos em profundidade, por NOME de campo.
 *
 * Serve pro `metadata` da Inbox, que guarda a resposta CRUA do provedor no
 * momento do provisionamento. Essa resposta contem o token da instancia — a
 * Evolution devolve em `hash.apikey`, a UazAPI no corpo do init. Ou seja: a
 * mesma chave que a listagem mascara com cuidado em `instance_api_key` ia
 * inteira pro navegador dentro do metadata, anulando o mascaramento.
 *
 * Como o formato varia por provedor (e muda quando eles atualizam a API), a
 * redacao e por nome de campo em qualquer profundidade, e nao por caminho
 * conhecido — provedor novo ja nasce coberto.
 */
export function redactDeep(valor: unknown, profundidade = 0): unknown {
  // Guarda contra estrutura ciclica ou absurdamente aninhada.
  if (profundidade > 8) return valor;

  if (Array.isArray(valor)) {
    return valor.map((v) => redactDeep(v, profundidade + 1));
  }
  if (!valor || typeof valor !== 'object') return valor;

  const out: Record<string, unknown> = {};
  for (const [chave, v] of Object.entries(valor as Record<string, unknown>)) {
    const ehSecreto = CAMPOS_SECRETOS.includes(chave.toLowerCase());
    if (ehSecreto && typeof v === 'string' && v.length > 0) {
      out[chave] = REDACTED;
    } else if (ehSecreto && v && typeof v === 'object') {
      // Ex: Evolution manda `hash: { apikey: "..." }` — o objeto inteiro cai.
      out[chave] = REDACTED;
    } else {
      out[chave] = redactDeep(v, profundidade + 1);
    }
  }
  return out;
}
