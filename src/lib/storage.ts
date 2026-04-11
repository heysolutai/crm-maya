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

function getS3Client(): S3Client {
  const endpoint = process.env.B2_ENDPOINT;
  const region = process.env.B2_BUCKET_REGION || "us-west-004";
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;

  if (!endpoint || !keyId || !appKey) {
    throw new Error("Backblaze B2 não configurado. Defina B2_ENDPOINT, B2_KEY_ID e B2_APP_KEY no .env");
  }

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: keyId,
      secretAccessKey: appKey,
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
  const client = getS3Client();
  const bucket = process.env.B2_BUCKET_NAME;
  if (!bucket) throw new Error("B2_BUCKET_NAME não definido");

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicUrl = process.env.B2_PUBLIC_URL || `${process.env.B2_ENDPOINT}/${bucket}`;
  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}

/**
 * Deleta um arquivo do B2 pela key.
 */
export async function deleteFromB2(key: string): Promise<void> {
  const client = getS3Client();
  const bucket = process.env.B2_BUCKET_NAME;
  if (!bucket) throw new Error("B2_BUCKET_NAME não definido");

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Extrai a key do B2 a partir de uma URL pública (ou retorna null se nao parecer B2).
 * Suporta tanto o formato path-style (endpoint/bucket/key) quanto o B2_PUBLIC_URL customizado.
 */
export function extractB2Key(url: string | null | undefined): string | null {
  if (!url) return null;

  const bucket = process.env.B2_BUCKET_NAME;
  const publicUrl = (process.env.B2_PUBLIC_URL || "").replace(/\/$/, "");
  const endpoint = (process.env.B2_ENDPOINT || "").replace(/\/$/, "");

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
  const key = extractB2Key(url);
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
