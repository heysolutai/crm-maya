/**
 * Ressincroniza webhooks das instancias UAZapi pra apontar pro path correto.
 *
 * Contexto: o fluxo multi-agente em POST /api/agents registrava o webhook como
 * /api/webhooks/uazapi?agentId=... mas a rota real e /api/webhooks/whatsapp.
 * Resultado: UAZapi entregava num path inexistente e nada chegava no CRM.
 *
 * Pra cada instancia channelType=uazapi:
 *   1. Calcula a URL correta: ${PUBLIC_APP_URL}/api/webhooks/whatsapp?agentId=${id}
 *   2. Lista webhooks atuais na UAZapi
 *   3. Remove URLs antigas que apontam pro CRM com path errado
 *      (qualquer URL contendo /api/webhooks/uazapi)
 *   4. Adiciona a URL correta (idempotente — se ja existir, UAZapi mantem)
 *
 * Uso (na VPS, com .env presente):
 *   cd /var/www/crm-maya
 *   npx tsx scripts/resync-uazapi-webhooks.ts          # dry-run
 *   npx tsx scripts/resync-uazapi-webhooks.ts --apply  # executa
 *
 * Idempotente: rode quantas vezes quiser.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadDotEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), 'utf8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.substring(0, eq).trim();
        let val = line.substring(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (process.env[key] == null || process.env[key] === '') {
          process.env[key] = val;
        }
      }
    } catch {
      // arquivo nao existe — segue
    }
  }
}

const APPLY = process.argv.includes('--apply');

const WRONG_PATH_FRAGMENT = '/api/webhooks/uazapi';

interface WebhookEntry {
  url: string;
  enabled?: boolean;
  events?: string[];
  raw: unknown;
}

/**
 * UAZapi responde em formatos diferentes (versao do servidor + se ha 0/1/N webhooks):
 *  - { webhooks: [...] }
 *  - { webhook: {...} }
 *  - [...]
 *  - { url, enabled, events }
 * Esse helper normaliza qualquer um pra lista de entries.
 */
function parseWebhookList(payload: unknown): WebhookEntry[] {
  if (!payload) return [];
  const items: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any).webhooks)
      ? (payload as any).webhooks
      : (payload as any).webhook
        ? [(payload as any).webhook]
        : (payload as any).url
          ? [payload]
          : [];
  return items
    .filter((it) => it && typeof it.url === 'string')
    .map((it) => ({
      url: it.url,
      enabled: typeof it.enabled === 'boolean' ? it.enabled : undefined,
      events: Array.isArray(it.events) ? it.events : undefined,
      raw: it,
    }));
}

async function uazapiGetWebhooks(apiUrl: string, token: string): Promise<WebhookEntry[]> {
  const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/webhook`, {
    method: 'GET',
    headers: { Accept: 'application/json', token },
  });
  if (!res.ok) {
    throw new Error(`GET /webhook ${res.status}: ${(await res.text()).substring(0, 200)}`);
  }
  const text = await res.text();
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`GET /webhook resposta nao-JSON: ${text.substring(0, 200)}`);
  }
  return parseWebhookList(data);
}

async function uazapiRemoveWebhook(apiUrl: string, token: string, url: string): Promise<void> {
  const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/webhook`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', token },
    body: JSON.stringify({ action: 'remove', url }),
  });
  if (!res.ok) {
    throw new Error(`POST /webhook (remove) ${res.status}: ${(await res.text()).substring(0, 200)}`);
  }
}

async function uazapiAddWebhook(apiUrl: string, token: string, url: string): Promise<void> {
  const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/webhook`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', token },
    body: JSON.stringify({
      action: 'add',
      enabled: true,
      url,
      events: ['messages', 'messages_update'],
      excludeMessages: ['isGroupYes'],
    }),
  });
  if (!res.ok) {
    throw new Error(`POST /webhook (add) ${res.status}: ${(await res.text()).substring(0, 200)}`);
  }
}

async function main() {
  loadDotEnv();

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL nao encontrada. Verifique se ha .env (ou .env.local) no cwd.');
    process.exit(1);
  }

  const publicAppUrl = (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  if (!publicAppUrl) {
    console.error('PUBLIC_APP_URL ou NEXT_PUBLIC_APP_URL precisa estar setada pra calcular a URL correta do webhook.');
    process.exit(1);
  }

  const { prisma } = await import('../src/lib/db');

  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY-RUN ===  (use --apply pra executar)');
  console.log('Base URL publica:', publicAppUrl);
  console.log('');

  const instances = await prisma.whatsappInstance.findMany({
    where: { channelType: 'uazapi', isActive: true },
    select: {
      id: true,
      companyId: true,
      instanceName: true,
      displayName: true,
      apiUrl: true,
      instanceApiKey: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Encontradas ${instances.length} instancia(s) UAZapi ativas\n`);
  if (instances.length === 0) return;

  let okCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const inst of instances) {
    const label = `[${inst.id.slice(0, 8)} ${inst.displayName || inst.instanceName}]`;

    if (!inst.apiUrl || !inst.instanceApiKey) {
      console.warn(`${label} sem apiUrl ou instanceApiKey — skip`);
      skippedCount++;
      continue;
    }

    const correctUrl = `${publicAppUrl}/api/webhooks/whatsapp?agentId=${inst.id}`;

    let current: WebhookEntry[];
    try {
      current = await uazapiGetWebhooks(inst.apiUrl, inst.instanceApiKey);
    } catch (err) {
      console.error(`${label} falha ao listar webhooks:`, (err as Error).message);
      failedCount++;
      continue;
    }

    const wrongOnes = current.filter(
      (w) => w.url.includes(WRONG_PATH_FRAGMENT) && w.url.includes(publicAppUrl)
    );
    const alreadyCorrect = current.some((w) => w.url === correctUrl);

    console.log(`${label}`);
    console.log(`  webhooks atuais: ${current.length}`);
    for (const w of current) {
      console.log(`    - ${w.url}${w.enabled === false ? ' (disabled)' : ''}`);
    }
    console.log(`  URL correta: ${correctUrl}`);

    if (wrongOnes.length === 0 && alreadyCorrect) {
      console.log(`  ja esta correto, nada a fazer`);
      okCount++;
      console.log('');
      continue;
    }

    if (wrongOnes.length > 0) {
      console.log(`  vai remover ${wrongOnes.length} URL(s) com path errado:`);
      for (const w of wrongOnes) console.log(`    x ${w.url}`);
    }
    if (!alreadyCorrect) {
      console.log(`  vai adicionar URL correta`);
    }

    if (!APPLY) {
      skippedCount++;
      console.log('');
      continue;
    }

    try {
      for (const w of wrongOnes) {
        await uazapiRemoveWebhook(inst.apiUrl, inst.instanceApiKey, w.url);
        console.log(`    removido: ${w.url}`);
      }
      if (!alreadyCorrect) {
        await uazapiAddWebhook(inst.apiUrl, inst.instanceApiKey, correctUrl);
        console.log(`    adicionado: ${correctUrl}`);
      }
      okCount++;
    } catch (err) {
      console.error(`${label} falha:`, (err as Error).message);
      failedCount++;
    }
    console.log('');
  }

  console.log(`=== Resumo: ${okCount} ok, ${failedCount} falhou, ${skippedCount} pulado ===`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('fatal:', err);
    process.exit(1);
  });
