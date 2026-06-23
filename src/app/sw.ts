import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

// IMPORTANTE: nunca deixar o SW tocar em requests NAO-GET (uploads de arquivo
// com FormData, POST/PUT/DELETE de API). O re-fetch do Serwist/Workbox corrompe
// o body multipart e o servidor falha com "Failed to parse body as FormData".
// Registrado ANTES do addEventListeners: stopImmediatePropagation impede o
// handler do Serwist de rodar e, sem respondWith, o browser faz o fetch nativo
// (body intacto). So mexe em mutacoes — GET (cache de assets/paginas) segue igual.
self.addEventListener("fetch", (event: FetchEvent) => {
  if (event.request.method !== "GET") {
    event.stopImmediatePropagation();
  }
});

serwist.addEventListeners();

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────

interface PushPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: {
    url?: string;
    conversationId?: string;
    [key: string]: unknown;
  };
  actions?: Array<{ action: string; title: string }>;
  requireInteraction?: boolean;
}

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Nova mensagem", body: event.data.text() };
  }

  const {
    title = "Nova mensagem",
    body = "",
    icon = "/icon-192x192.png",
    badge = "/icon-192x192.png",
    tag,
    data = {},
    actions = [],
    requireInteraction = false,
  } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      badge,
      tag,
      data,
      actions,
      requireInteraction,
    } as unknown as NotificationOptions)
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const data = (event.notification.data || {}) as { url?: string };
  const targetUrl = data.url || "/app/conversations";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Se ja ha uma janela aberta no app, focar e navegar pra URL
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(targetUrl);
            } catch {
              // fallback silencioso
            }
          }
          return;
        }
      }

      // Senao, abrir nova janela
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
