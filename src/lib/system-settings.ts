/**
 * Acesso a configuracoes globais editaveis em runtime (super-admin).
 *
 * Ordem de resolucao:
 *   1. DB (system_settings) — editavel sem restart
 *   2. process.env (fallback legado — deprecated mas mantido)
 *   3. defaultValue passado na chamada
 *
 * Cache em memoria com TTL de 60s, invalidado quando algum admin atualiza
 * via PUT /api/admin/system-settings (chama invalidateCache()).
 */

import { prisma } from './db';

const CACHE_TTL_MS = 60_000;

let cachedAt = 0;
let cache: Record<string, string | null> = {};

async function loadCache(): Promise<void> {
  const now = Date.now();
  if (now - cachedAt < CACHE_TTL_MS && Object.keys(cache).length > 0) return;

  try {
    const rows = await prisma.systemConfig.findMany({
      select: { key: true, value: true },
    });
    cache = {};
    for (const row of rows) {
      cache[row.key] = row.value;
    }
    cachedAt = now;
  } catch (error) {
    // Se a tabela nao existe ainda (pre-migration), continua com cache vazio.
    // Os fallbacks de env e default cobrem.
    console.warn('[system-settings] failed to load cache (continuing with env fallback):', (error as Error).message);
  }
}

/**
 * Mapeia chave da tabela pra nome da env var equivalente (fallback legado).
 * Convencao: lowercase com underscore na DB, UPPER_SNAKE no env.
 */
const ENV_FALLBACK: Record<string, string> = {
  n8n_ai_webhook_url:           'N8N_AI_WEBHOOK_URL',
  n8n_faq_upload_webhook_url:   'N8N_FAQ_UPLOAD_WEBHOOK_URL',
  knowledge_webhook_url:        'KNOWLEDGE_WEBHOOK_URL',
  default_openai_api_key:       'DEFAULT_OPENAI_API_KEY',
};

export async function getSystemSetting(
  key: string,
  defaultValue?: string
): Promise<string | undefined> {
  await loadCache();
  const dbValue = cache[key];
  if (dbValue && dbValue.trim() !== '') return dbValue.trim();

  const envKey = ENV_FALLBACK[key];
  if (envKey && process.env[envKey] && process.env[envKey]!.trim() !== '') {
    return process.env[envKey]!.trim();
  }

  return defaultValue;
}

/**
 * Variante que IGNORA o cache — sempre faz query no banco.
 * Use em workers de baixa frequencia (transcricao, n8n) onde a key precisa
 * ser confiavel mesmo logo apos o admin atualizar pela UI (cluster mode
 * pode ter caches separados por processo).
 */
export async function getSystemSettingFresh(
  key: string,
  defaultValue?: string
): Promise<string | undefined> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key },
      select: { value: true },
    });
    if (row?.value && row.value.trim() !== '') return row.value.trim();
  } catch (error) {
    console.warn('[system-settings] fresh read failed (using env fallback):', (error as Error).message);
  }

  const envKey = ENV_FALLBACK[key];
  if (envKey && process.env[envKey] && process.env[envKey]!.trim() !== '') {
    return process.env[envKey]!.trim();
  }

  return defaultValue;
}

/** Limpa cache — chamado pelo PUT depois de salvar */
export function invalidateSystemSettingsCache(): void {
  cache = {};
  cachedAt = 0;
}

/** Lista de chaves conhecidas (pra UI exibir todas mesmo se algumas vazias) */
export const KNOWN_SETTINGS = [
  {
    key: 'n8n_ai_webhook_url',
    label: 'N8N - Webhook IA',
    description: 'URL do N8N que recebe mensagens dos clientes pra IA processar (usado como fallback quando o agente nao tem URL propria).',
    isSecret: false,
    placeholder: 'https://n8n.exemplo.com/webhook/ai',
  },
  {
    key: 'n8n_faq_upload_webhook_url',
    label: 'N8N - Upload FAQ',
    description: 'URL do N8N que recebe arquivos enviados pra base de conhecimento.',
    isSecret: false,
    placeholder: 'https://n8n.exemplo.com/webhook/faq-upload',
  },
  {
    key: 'knowledge_webhook_url',
    label: 'N8N - Sincronia Knowledge Base',
    description: 'URL do N8N que sincroniza FAQs da empresa pra base de conhecimento.',
    isSecret: false,
    placeholder: 'https://n8n.exemplo.com/webhook/sync-kb',
  },
  {
    key: 'default_openai_api_key',
    label: 'OpenAI API Key (default)',
    description: 'Chave OpenAI usada quando a empresa nao tem chave propria configurada.',
    isSecret: true,
    placeholder: 'sk-...',
  },
] as const;
