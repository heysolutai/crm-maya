import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
};

// ─────────────────────────────────────────────────────────────────────────
//  SW ENXUTO — SEM cache de paginas/assets.
//
//  Motivo: o precache do Serwist guardava o app-shell e, depois de um deploy
//  novo, o SW antigo servia HTML/chunks desatualizados -> "pagina em branco"
//  + erro de manifest no console. Tambem corrompia uploads (FormData).
//
//  Aqui o SW NAO faz cache nenhum (tudo vem fresco da rede). Mantemos APENAS
//  push notifications. No `activate` apagamos qualquer cache deixado por
//  versoes antigas do SW — entao, ao atualizar pra esta versao, o lixo some.
//  O __SW_MANIFEST e injetado pelo build mas nao e usado (sem precache).
// ─────────────────────────────────────────────────────────────────────────
void self.__SW_MANIFEST;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      // Limpa caches de versoes anteriores (precache/runtime) — corrige o
      // app-shell em branco deixado pelo SW antigo.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

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
