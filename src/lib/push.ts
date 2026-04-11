import webpush, { type PushSubscription as WebPushSubscription } from 'web-push';
import { prisma } from '@/lib/db';

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@wyarp.com.br';

  if (!publicKey || !privateKey) {
    console.warn('[Push] VAPID keys nao configuradas. Push notifications desabilitadas.');
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

export interface PushNotificationPayload {
  title: string;
  body?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  requireInteraction?: boolean;
  data?: {
    url?: string;
    conversationId?: string;
    messageId?: string;
    [key: string]: unknown;
  };
  actions?: Array<{ action: string; title: string }>;
}

/**
 * Envia push pra um conjunto especifico de subscriptions.
 * Se alguma subscription estiver expirada/invalida (410/404), deleta do banco.
 */
export async function sendPushToSubscriptions(
  subscriptionIds: string[],
  payload: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!ensureVapid() || subscriptionIds.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const subs = await prisma.pushSubscription.findMany({
    where: { id: { in: subscriptionIds } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  let sent = 0;
  let failed = 0;
  const toDelete: string[] = [];
  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      const pushSub: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(pushSub, body, { TTL: 60 });
        sent++;
      } catch (err: any) {
        failed++;
        // 410 Gone ou 404 = subscription morta, deleta
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          toDelete.push(sub.id);
        } else {
          console.warn('[Push] falha ao enviar:', err?.statusCode, err?.message);
        }
      }
    })
  );

  if (toDelete.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: toDelete } } }).catch(() => {});
  }

  // Atualiza last_used_at das que deram certo
  if (sent > 0) {
    const okIds = subs.filter((s) => !toDelete.includes(s.id)).map((s) => s.id);
    prisma.pushSubscription
      .updateMany({ where: { id: { in: okIds } }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return { sent, failed };
}

/**
 * Envia push pra todos os usuarios ativos de uma company (exceto os IDs em `excludeUserIds`).
 */
export async function sendPushToCompany(
  companyId: string,
  payload: PushNotificationPayload,
  excludeUserIds: string[] = []
): Promise<{ sent: number; failed: number }> {
  const subs = await prisma.pushSubscription.findMany({
    where: {
      companyId,
      ...(excludeUserIds.length > 0 ? { userId: { notIn: excludeUserIds } } : {}),
    },
    select: { id: true },
  });
  return sendPushToSubscriptions(subs.map((s) => s.id), payload);
}
