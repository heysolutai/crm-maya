/**
 * Backblaze B2 Storage: compatível com S3 via @aws-sdk/client-s3
 *
 * Variáveis de ambiente necessárias (.env na VPS):
 *   B2_KEY_ID         = keyID da sua Application Key (começa com 00...)
 *   B2_APP_KEY        = applicationKey da sua Application Key
 *   B2_BUCKET_NAME    = nome do bucket (ex: crm-media)
 *   B2_BUCKET_REGION  = região do bucket (ex: us-west-004)
 *   B2_ENDPOINT       = endpoint S3 do B2 (ex: https://s3.us-west-004.backblazeb2.com)
 *   B2_PUBLIC_URL     = URL pública do bucket (ex: https://crm-media.s3.us-west-004.backblazeb2.com)
 *                       ou CDN Cloudflare se configurado
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID, createHash } from "crypto";
import { getSystemSetting } from "./system-settings";

export interface StorageConfig {
  endpoint?: string;
  region: string;
  keyId?: string;
  appKey?: string;
  bucket?: string;
  publicUrl?: string;
}

/**
 * Resolve a config do B2 do system_settings (editavel no Super-admin >
 * Configuracoes do Sistema) com fallback pro .env. Assim da pra trocar
 * credenciais pela UI, sem redeploy.
 */
/**
 * Endpoint do B2 precisa ser URL ABSOLUTA.
 *
 * Salvo sem "https://" (facil de fazer no campo do super-admin, e o painel da
 * Backblaze mostra o host sem protocolo), o SDK da AWS estoura
 * "TypeError: Invalid URL" ao montar o cliente. Nenhum upload acontece: audio,
 * imagem e figurinha ficam todos sem arquivo, e o erro nao diz o que corrigir.
 * Aqui o protocolo e completado sozinho.
 */
function normalizarUrlBase(valor?: string): string | undefined {
  if (!valor) return undefined;
  const limpo = valor.trim().replace(/\/+$/, '');
  if (!limpo) return undefined;
  return /^https?:\/\//i.test(limpo) ? limpo : `https://${limpo}`;
}

export async function getStorageConfig(): Promise<StorageConfig> {
  const [endpoint, region, keyId, appKey, bucket, publicUrl] = await Promise.all([
    getSystemSetting("b2_endpoint"),
    getSystemSetting("b2_bucket_region", "us-west-004"),
    getSystemSetting("b2_key_id"),
    getSystemSetting("b2_app_key"),
    getSystemSetting("b2_bucket_name"),
    getSystemSetting("b2_public_url"),
  ]);
  return {
    endpoint: normalizarUrlBase(endpoint),
    region: region || "us-west-004",
    keyId: keyId?.trim(),
    appKey: appKey?.trim(),
    bucket: bucket?.trim(),
    publicUrl: normalizarUrlBase(publicUrl),
  };
}

function buildS3Client(cfg: StorageConfig): S3Client {
  if (!cfg.endpoint || !cfg.keyId || !cfg.appKey) {
    throw new Error(
      "Backblaze B2 nao configurado. Preencha endpoint, key id e app key em Super-admin > Configuracoes do Sistema (ou no .env)."
    );
  }
  // Ja normalizado acima; se ainda assim nao for URL valida, a mensagem diz o
  // que esta errado e onde arrumar, em vez de "Invalid URL".
  try {
    new URL(cfg.endpoint);
  } catch {
    throw new Error(
      `Endpoint do B2 invalido: "${cfg.endpoint}". Corrija em Super-admin > Configuracoes do Sistema ` +
      `(exemplo: https://s3.us-west-004.backblazeb2.com).`
    );
  }

  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.keyId,
      secretAccessKey: cfg.appKey,
    },
    forcePathStyle: true, // Obrigatório para B2
    // A partir do SDK 3.729 o cliente manda checksum CRC32 em todo upload. O B2
    // nao e a AWS: e a configuracao que a propria Backblaze recomenda pro SDK
    // v3. Sem isto, upload que a AWS aceitaria volta com erro de corpo
    // ("request body was too small") e a midia fica indisponivel pra sempre.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** Erros em que vale repetir pela API nativa do B2. */
const ERRO_DE_CORPO = /too small|too large|IncompleteBody|BadDigest|RequestTimeout|XAmzContentSHA256Mismatch/i;

function descreverErroS3(e: unknown): { code: string; status?: number; requestId?: string; message: string } {
  const err = (e || {}) as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
  return {
    code: err.Code || err.name || "Erro",
    status: err.$metadata?.httpStatusCode,
    requestId: err.$metadata?.requestId,
    message: err.message || String(e),
  };
}

/**
 * Faz upload de um Buffer para o B2 e retorna a URL pública.
 */
export async function uploadToB2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const cfg = await getStorageConfig();
  if (!cfg.bucket) throw new Error("Bucket do B2 nao definido (b2_bucket_name)");
  const client = buildS3Client(cfg);

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: buffer,
        // Explicito: o B2 compara com o que recebe, e e essa comparacao que
        // gera "request body was too small" quando algo desalinha.
        ContentLength: buffer.byteLength,
        ContentType: contentType,
      })
    );
  } catch (primeiro) {
    const d = descreverErroS3(primeiro);
    console.error(
      `[B2] PutObject falhou key=${key} bytes=${buffer.byteLength} tipo=${contentType} ` +
      `status=${d.status ?? "-"} code=${d.code} requestId=${d.requestId ?? "-"}: ${d.message}`
    );
    if (!ERRO_DE_CORPO.test(`${d.code} ${d.message}`)) {
      throw new Error(`B2 ${d.code}${d.status ? ` (HTTP ${d.status})` : ""}: ${d.message}`);
    }
    // A camada S3 do B2 recusou o corpo. A API nativa grava no MESMO bucket e
    // no mesmo nome, entao a URL publica nao muda.
    try {
      await uploadNativoB2(buffer, key, contentType, cfg);
      console.warn(`[B2] PutObject S3 recusou (${d.code}); gravado pela API nativa key=${key}`);
    } catch (segundo) {
      const d2 = descreverErroS3(segundo);
      throw new Error(
        `B2 ${d.code}${d.status ? ` (HTTP ${d.status})` : ""}: ${d.message}; ` +
        `API nativa tambem falhou: ${d2.message} ` +
        `[${buffer.byteLength} bytes, ${contentType}, requestId ${d.requestId ?? "-"}]`
      );
    }
  }

  const publicUrl = cfg.publicUrl || `${cfg.endpoint}/${cfg.bucket}`;
  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}

// ---------------------------------------------------------------------------
// API nativa do B2 (b2_authorize_account -> b2_get_upload_url -> b2_upload_file)
//
// Existe porque a camada S3-compativel do B2 devolve IncompleteBody pra um
// PutObject correto. As mesmas credenciais valem nas duas APIs e o arquivo cai
// no mesmo bucket com o mesmo nome.
// ---------------------------------------------------------------------------

interface SessaoNativaB2 {
  apiUrl: string;
  token: string;
  bucketId: string;
  criadaEm: number;
}

let sessaoNativa: SessaoNativaB2 | null = null;

async function autorizarNativoB2(cfg: StorageConfig): Promise<SessaoNativaB2> {
  // Token vale 24h; renova com folga.
  if (sessaoNativa && Date.now() - sessaoNativa.criadaEm < 20 * 60 * 60 * 1000) return sessaoNativa;
  if (!cfg.keyId || !cfg.appKey || !cfg.bucket) throw new Error("B2 nao configurado");

  const res = await fetch("https://api.backblazeb2.com/b2api/v3/b2_authorize_account", {
    headers: { Authorization: "Basic " + Buffer.from(`${cfg.keyId}:${cfg.appKey}`).toString("base64") },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`b2_authorize_account ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const j = (await res.json()) as {
    accountId: string;
    authorizationToken: string;
    apiUrl?: string;
    apiInfo?: { storageApi?: { apiUrl?: string; bucketId?: string; bucketName?: string } };
    allowed?: { bucketId?: string; bucketName?: string };
  };
  const apiUrl = j.apiInfo?.storageApi?.apiUrl || j.apiUrl;
  if (!apiUrl) throw new Error("b2_authorize_account sem apiUrl na resposta");

  let bucketId = j.apiInfo?.storageApi?.bucketId || j.allowed?.bucketId || "";
  const bucketPermitido = j.apiInfo?.storageApi?.bucketName || j.allowed?.bucketName;
  if (bucketId && bucketPermitido && bucketPermitido !== cfg.bucket) {
    throw new Error(`chave B2 restrita ao bucket "${bucketPermitido}", nao "${cfg.bucket}"`);
  }
  if (!bucketId) {
    const lb = await fetch(`${apiUrl}/b2api/v3/b2_list_buckets`, {
      method: "POST",
      headers: { Authorization: j.authorizationToken, "Content-Type": "application/json" },
      body: JSON.stringify({ accountId: j.accountId, bucketName: cfg.bucket }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!lb.ok) throw new Error(`b2_list_buckets ${lb.status}: ${(await lb.text().catch(() => "")).slice(0, 200)}`);
    const lj = (await lb.json()) as { buckets?: Array<{ bucketId: string; bucketName: string }> };
    bucketId = lj.buckets?.find((b) => b.bucketName === cfg.bucket)?.bucketId || "";
    if (!bucketId) throw new Error(`bucket "${cfg.bucket}" nao encontrado na conta B2`);
  }

  sessaoNativa = { apiUrl, token: j.authorizationToken, bucketId, criadaEm: Date.now() };
  return sessaoNativa;
}

/** fetch nao aceita Buffer no tipo; copia pra um ArrayBuffer proprio. */
function corpoParaFetch(b: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(b.byteLength);
  new Uint8Array(ab).set(b);
  return ab;
}

/** Upload pela API nativa do B2. Mesmo bucket e mesmo nome do caminho S3. */
export async function uploadNativoB2(
  buffer: Buffer,
  key: string,
  contentType: string,
  config?: StorageConfig
): Promise<void> {
  const cfg = config ?? (await getStorageConfig());
  const sessao = await autorizarNativoB2(cfg);
  const gu = await fetch(`${sessao.apiUrl}/b2api/v3/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: sessao.token, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: sessao.bucketId }),
    signal: AbortSignal.timeout(15_000),
  });
  if (gu.status === 401) {
    sessaoNativa = null;
    throw new Error("b2_get_upload_url 401 (token expirado; a proxima tentativa reautoriza)");
  }
  if (!gu.ok) throw new Error(`b2_get_upload_url ${gu.status}: ${(await gu.text().catch(() => "")).slice(0, 200)}`);
  const { uploadUrl, authorizationToken } = (await gu.json()) as { uploadUrl: string; authorizationToken: string };

  const sha1 = createHash("sha1").update(buffer).digest("hex");
  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: authorizationToken,
      // Nome percent-encoded; barras podem ficar (regra do B2).
      "X-Bz-File-Name": encodeURIComponent(key).replace(/%2F/g, "/"),
      "Content-Type": contentType,
      "X-Bz-Content-Sha1": sha1,
    },
    body: corpoParaFetch(buffer),
    signal: AbortSignal.timeout(60_000),
  });
  if (!up.ok) throw new Error(`b2_upload_file ${up.status}: ${(await up.text().catch(() => "")).slice(0, 300)}`);
}

/**
 * Deleta um arquivo do B2 pela key.
 */
export async function deleteFromB2(key: string): Promise<void> {
  const cfg = await getStorageConfig();
  if (!cfg.bucket) throw new Error("Bucket do B2 nao definido (b2_bucket_name)");
  const client = buildS3Client(cfg);

  await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
}

/**
 * Extrai a key do B2 a partir de uma URL pública (ou retorna null se nao parecer B2).
 * Suporta tanto o formato path-style (endpoint/bucket/key) quanto o B2_PUBLIC_URL customizado.
 */
export function extractB2Key(
  url: string | null | undefined,
  cfg?: Pick<StorageConfig, "bucket" | "publicUrl" | "endpoint">
): string | null {
  if (!url) return null;

  const bucket = cfg?.bucket ?? process.env.B2_BUCKET_NAME;
  const publicUrl = (cfg?.publicUrl ?? process.env.B2_PUBLIC_URL ?? "").replace(/\/$/, "");
  const endpoint = (cfg?.endpoint ?? process.env.B2_ENDPOINT ?? "").replace(/\/$/, "");

  // 1) Match contra B2_PUBLIC_URL customizado (CDN, etc)
  if (publicUrl && url.startsWith(publicUrl + "/")) {
    return url.slice(publicUrl.length + 1);
  }

  // 2) Match contra endpoint/bucket/...
  if (endpoint && bucket && url.startsWith(`${endpoint}/${bucket}/`)) {
    return url.slice(`${endpoint}/${bucket}/`.length);
  }

  // 3) Fallback: se a URL contem "/media/" e parece ser nosso padrao de key, extrai
  const mediaIdx = url.indexOf("/media/");
  if (mediaIdx !== -1) {
    return url.slice(mediaIdx + 1); // remove a "/" inicial
  }

  return null;
}

/**
 * Deleta mídia do B2 silenciosamente (nao propaga erros: cleanup best-effort).
 */
export async function deleteMediaFromUrl(url: string | null | undefined): Promise<void> {
  const cfg = await getStorageConfig();
  const key = extractB2Key(url, cfg);
  if (!key) return;
  try {
    await deleteFromB2(key);
    console.log("[Storage] Deletado do B2:", key);
  } catch (err) {
    console.warn("[Storage] Falha ao deletar do B2:", key, err);
  }
}

/**
 * Monta a chave (path) do arquivo no B2.
 * Ex: "media/company-abc/images/image_conv-xyz_1234567890.jpg"
 */
export function buildB2Key(
  messageType: string,
  companyId: string,
  conversationId: string,
  extension: string
): string {
  return `media/${companyId}/${messageType}s/${messageType}_${conversationId}_${Date.now()}_${randomUUID().slice(0, 8)}.${extension}`;
}

/** true quando a URL aponta pro NOSSO storage (B2 ou CDN configurado). */
export function isOwnedStorageUrl(url: string | null | undefined): boolean {
  return !!extractB2Key(url);
}

/** Mapa de MIME type para extensão */
export const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  // Alguns provedores mandam o codec como MIME. Sem esta linha a extensao
  // virava ".opus" via split, e o proxy servia um tipo que o Safari recusa.
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/octet-stream": "bin",
};
