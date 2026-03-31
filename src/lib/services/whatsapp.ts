/**
 * WhatsApp service layer
 *
 * Wraps UAZapi HTTP calls so routes only deal with business logic.
 * All functions call `${instanceApiUrl}/<endpoint>` with the header
 * `token: instanceApiKey` — the format used throughout the codebase.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendTextParams {
  instanceApiUrl: string;
  instanceApiKey: string;
  phone: string;
  message: string;
}

export interface SendMediaParams {
  instanceApiUrl: string;
  instanceApiKey: string;
  phone: string;
  /** Public URL or base-64 string of the media file. */
  mediaUrl: string;
  caption?: string;
  /** UAZapi media type: 'image' | 'video' | 'document' | 'audio' | 'ptt' | 'sticker'. Defaults to 'image'. */
  messageType?: string;
}

export interface SendReactionParams {
  instanceApiUrl: string;
  instanceApiKey: string;
  phone: string;
  /** Internal (UAZ) message ID to react to. */
  messageId: string;
  emoji: string;
}

export interface GetInstanceStatusParams {
  apiUrl: string;
  apiKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the standard UAZapi request headers.
 */
function uazHeaders(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    token: apiKey,
  };
}

/**
 * Strip all non-digit characters from a phone string so UAZapi receives
 * a clean numeric identifier (e.g. "5511999990000").
 */
function cleanPhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Send a plain-text WhatsApp message via UAZapi.
 *
 * @param params  Connection details and message content.
 * @param _tx     Reserved for future Prisma transaction propagation.
 * @returns       Raw UAZapi response body.
 */
export async function sendTextMessage(
  params: SendTextParams,
  _tx?: unknown
): Promise<unknown> {
  const { instanceApiUrl, instanceApiKey, phone, message } = params;

  const response = await fetch(`${instanceApiUrl}/send/text`, {
    method: 'POST',
    headers: uazHeaders(instanceApiKey),
    body: JSON.stringify({
      number: cleanPhone(phone),
      text: message,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[whatsapp.sendTextMessage] UAZapi error ${response.status}: ${body}`
    );
  }

  return response.json();
}

/**
 * Send a media (image, video, document, audio, sticker, etc.) WhatsApp
 * message via UAZapi.
 *
 * @param params  Connection details plus media URL, optional caption and type.
 * @param _tx     Reserved for future Prisma transaction propagation.
 * @returns       Raw UAZapi response body.
 */
export async function sendMediaMessage(
  params: SendMediaParams,
  _tx?: unknown
): Promise<unknown> {
  const {
    instanceApiUrl,
    instanceApiKey,
    phone,
    mediaUrl,
    caption,
    messageType = 'image',
  } = params;

  const payload: Record<string, unknown> = {
    number: cleanPhone(phone),
    type: messageType,
    file: mediaUrl,
  };

  if (caption !== undefined) {
    payload.text = caption;
  }

  const response = await fetch(`${instanceApiUrl}/send/media`, {
    method: 'POST',
    headers: uazHeaders(instanceApiKey),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[whatsapp.sendMediaMessage] UAZapi error ${response.status}: ${body}`
    );
  }

  return response.json();
}

/**
 * Send a reaction emoji to a specific WhatsApp message via UAZapi.
 *
 * @param params  Connection details, target message ID, and emoji string.
 * @param _tx     Reserved for future Prisma transaction propagation.
 * @returns       Raw UAZapi response body.
 */
export async function sendReaction(
  params: SendReactionParams,
  _tx?: unknown
): Promise<unknown> {
  const { instanceApiUrl, instanceApiKey, phone, messageId, emoji } = params;

  const response = await fetch(`${instanceApiUrl}/send/reaction`, {
    method: 'POST',
    headers: uazHeaders(instanceApiKey),
    body: JSON.stringify({
      number: cleanPhone(phone),
      reactionMessageId: messageId,
      reaction: emoji,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[whatsapp.sendReaction] UAZapi error ${response.status}: ${body}`
    );
  }

  return response.json();
}

/**
 * Check whether a UAZapi WhatsApp instance is currently connected.
 *
 * UAZapi returns a JSON object with a `status` field (e.g. "CONNECTED",
 * "DISCONNECTED", "TIMEOUT"). We normalise this into a simple boolean.
 *
 * @param params  The instance base URL and API key.
 * @param _tx     Reserved for future Prisma transaction propagation.
 * @returns       `{ connected: boolean }`.
 */
export async function getInstanceStatus(
  params: GetInstanceStatusParams,
  _tx?: unknown
): Promise<{ connected: boolean }> {
  const { apiUrl, apiKey } = params;

  const response = await fetch(`${apiUrl}/instance/status`, {
    method: 'GET',
    headers: uazHeaders(apiKey),
  });

  if (!response.ok) {
    // Treat non-2xx as "not connected" rather than throwing, so callers can
    // degrade gracefully without crashing.
    return { connected: false };
  }

  const data = (await response.json()) as { status?: string; connected?: boolean };

  // UAZapi v1 uses { status: "CONNECTED" | ... }
  // UAZapi v2+ may use { connected: true | false }
  const connected =
    data.connected === true ||
    (typeof data.status === 'string' &&
      data.status.toUpperCase() === 'CONNECTED');

  return { connected };
}
