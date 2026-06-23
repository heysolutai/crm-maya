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
  // Storage B2 (editavel no Super-admin; cai pro .env/stack se vazio)
  b2_endpoint:                  'B2_ENDPOINT',
  b2_bucket_name:               'B2_BUCKET_NAME',
  b2_bucket_region:             'B2_BUCKET_REGION',
  b2_key_id:                    'B2_KEY_ID',
  b2_app_key:                   'B2_APP_KEY',
  b2_public_url:                'B2_PUBLIC_URL',
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
  // ===== Storage de midia/arquivos (Backblaze B2 / S3) =====
  {
    key: 'b2_endpoint',
    label: 'Storage B2 — Endpoint',
    description: 'Endpoint S3 do Backblaze B2. Ex: https://s3.us-west-004.backblazeb2.com',
    isSecret: false,
    placeholder: 'https://s3.us-west-004.backblazeb2.com',
  },
  {
    key: 'b2_bucket_name',
    label: 'Storage B2 — Bucket',
    description: 'Nome do bucket onde midia e arquivos de FAQ sao guardados.',
    isSecret: false,
    placeholder: 'crm-media',
  },
  {
    key: 'b2_bucket_region',
    label: 'Storage B2 — Regiao',
    description: 'Regiao do bucket. Ex: us-west-004',
    isSecret: false,
    placeholder: 'us-west-004',
  },
  {
    key: 'b2_key_id',
    label: 'Storage B2 — Key ID',
    description: 'keyID da Application Key do B2 (comeca com 00...).',
    isSecret: true,
    placeholder: '005...',
  },
  {
    key: 'b2_app_key',
    label: 'Storage B2 — App Key',
    description: 'applicationKey (secreta) da Application Key do B2.',
    isSecret: true,
    placeholder: 'K005...',
  },
  {
    key: 'b2_public_url',
    label: 'Storage B2 — URL publica',
    description: 'URL publica do bucket (ou CDN). O N8N baixa os arquivos por aqui. Ex: https://crm-media.s3.us-west-004.backblazeb2.com',
    isSecret: false,
    placeholder: 'https://crm-media.s3.us-west-004.backblazeb2.com',
  },
] as const;
