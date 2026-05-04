/**
 * One-shot: migra audios antigos cujo `media_url` aponta pra URL criptografada
 * do WhatsApp (mmg.whatsapp.net) pro Backblaze B2.
 *
 * Pra cada mensagem:
 *   1. Localiza a instancia UAZapi da empresa pelo conversationId
 *   2. Chama UAZapi /message/download com return_base64
 *   3. Sobe o blob no B2
 *   4. Atualiza messages.media_url pro link estavel
 *
 * Uso (na VPS, com .env carregado):
 *   cd /var/www/crm-maya
 *   npx tsx scripts/migrate-orphan-audio-urls.ts          # dry-run
 *   npx tsx scripts/migrate-orphan-audio-urls.ts --apply  # executa
 *
 * Idempotente: rode quantas vezes quiser. So toca em mensagens cuja URL ainda
 * aponta pra whatsapp.net.
 */

import { prisma } from '../src/lib/db';
import { uploadToB2, buildB2Key, MIME_TO_EXT } from '../src/lib/storage';

const APPLY = process.argv.includes('--apply');

async function downloadFromUazAPI(
  messageKey: string,
  apiKey: string,
  apiUrl: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(`${apiUrl}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', token: apiKey },
      body: JSON.stringify({
        id: messageKey,
        return_base64: true,
        generate_mp3: false,
        return_link: false,
        transcribe: false,
        download_quoted: false,
      }),
    });
    if (!res.ok) {
      console.error(`  UAZapi ${res.status}: ${(await res.text()).substring(0, 200)}`);
      return null;
    }
    const j = await res.json();
    const raw: string | undefined = j.base64Data || j.base64 || j.data || j.file || j.content;
    const mimeType: string = (j.mimetype || j.mimeType || j.mime_type || 'audio/ogg').split(';')[0].trim();
    if (!raw || raw.length < 10) {
      console.error('  UAZapi sem base64 — fields:', Object.keys(j).join(','));
      return null;
    }
    let clean = raw;
    const c = clean.indexOf(',');
    if (c !== -1 && c < 100) clean = clean.substring(c + 1);
    clean = clean.replace(/[\s\r\n]/g, '');
    const buffer = Buffer.from(clean, 'base64');
    if (!buffer.length) return null;
    return { buffer, mimeType };
  } catch (err: any) {
    console.error('  UAZapi exception:', err.message);
    return null;
  }
}

async function main() {
  console.log(APPLY ? '=== APPLY MODE ===' : '=== DRY-RUN ===  (use --apply pra executar)');

  const orphan = await prisma.message.findMany({
    where: {
      messageType: { in: ['audio', 'ptt'] },
      mediaUrl: { contains: 'whatsapp.net' },
      uazMessageId: { not: null },
    },
    select: {
      id: true,
      conversationId: true,
      mediaUrl: true,
      uazMessageId: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Encontradas ${orphan.length} mensagens orfas (audio/ptt -> whatsapp.net)`);

  if (orphan.length === 0) return;

  // Pre-busca instancias por conversationId pra evitar N queries
  const conversationIds = [...new Set(orphan.map(m => m.conversationId))];
  const conversations = await prisma.conversation.findMany({
    where: { id: { in: conversationIds } },
    select: { id: true, companyId: true },
  });
  const convMap = new Map(conversations.map(c => [c.id, c]));

  const companyIds = [...new Set(conversations.map(c => c.companyId))];
  const instances = await prisma.whatsappInstance.findMany({
    where: { companyId: { in: companyIds }, isActive: true },
    select: { companyId: true, apiUrl: true, instanceApiKey: true },
  });
  const instanceMap = new Map(instances.map(i => [i.companyId, i]));

  let ok = 0, failed = 0, skipped = 0;
  for (const m of orphan) {
    const conv = convMap.get(m.conversationId);
    if (!conv) {
      console.warn(`[${m.id}] conversation nao encontrada, skip`);
      skipped++;
      continue;
    }
    const inst = instanceMap.get(conv.companyId);
    if (!inst?.apiUrl || !inst?.instanceApiKey) {
      console.warn(`[${m.id}] instance UAZapi nao configurada para company ${conv.companyId}, skip`);
      skipped++;
      continue;
    }

    console.log(`[${m.id}] baixando key=${m.uazMessageId}`);
    if (!APPLY) { skipped++; continue; }

    const dl = await downloadFromUazAPI(m.uazMessageId!, inst.instanceApiKey, inst.apiUrl);
    if (!dl) {
      console.error(`  falhou`);
      failed++;
      continue;
    }

    try {
      const ext = MIME_TO_EXT[dl.mimeType] || dl.mimeType.split('/')[1] || 'ogg';
      const key = buildB2Key('audio', conv.companyId, m.conversationId, ext);
      const b2Url = await uploadToB2(dl.buffer, key, dl.mimeType);
      await prisma.message.update({
        where: { id: m.id },
        data: { mediaUrl: b2Url },
      });
      console.log(`  -> ${b2Url} (${dl.buffer.length} bytes)`);
      ok++;
    } catch (err: any) {
      console.error(`  upload/update falhou:`, err?.message);
      failed++;
    }
  }

  console.log(`\n=== Resumo: ${ok} ok, ${failed} falhou, ${skipped} pulado ===`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('fatal:', err);
    process.exit(1);
  });
