/**
 * Backblaze B2 Storage — compatível com S3 via @aws-sdk/client-s3
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
import { randomUUID } from "crypto";
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
export async function getStorageConfig(): Promise<StorageConfig> {
  const [endpoint, region, keyId, appKey, bucket, publicUrl] = await Promise.all([
    getSystemSetting("b2_endpoint"),
    getSystemSetting("b2_bucket_region", "us-west-004"),
    getSystemSetting("b2_key_id"),
    getSystemSetting("b2_app_key"),
    getSystemSetting("b2_bucket_name"),
    getSystemSetting("b2_public_url"),
  ]);
  return { endpoint, region: region || "us-west-004", keyId, appKey, bucket, publicUrl };
}

function buildS3Client(cfg: StorageConfig): S3Client {
  if (!cfg.endpoint || !cfg.keyId || !cfg.appKey) {
    throw new Error(
      "Backblaze B2 nao configurado. Preencha endpoint, key id e app key em Super-admin > Configuracoes do Sistema (ou no .env)."
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
  });
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

  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicUrl = cfg.publicUrl || `${cfg.endpoint}/${cfg.bucket}`;
  return `${publicUrl.replace(/\/$/, "")}/${key}`;
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
 * Deleta mídia do B2 silenciosamente (nao propaga erros — cleanup best-effort).
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

/** Mapa de MIME type para extensão */
export const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/octet-stream": "bin",
};
