import webpush from "web-push";
import { prisma } from "./prisma.js";
import { env } from "./env.js";

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  if (!env.webPush.publicKey || !env.webPush.privateKey) {
    console.warn("[push] VAPID keys not configured — skipping push send.");
    return false;
  }
  webpush.setVapidDetails(env.webPush.subject, env.webPush.publicKey, env.webPush.privateKey);
  configured = true;
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

async function sendToSubscription(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: PushPayload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number } | null)?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      // Subscription no longer valid (browser unsubscribed, uninstalled, etc.) — clean it up.
      await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
    } else {
      console.error("[push] send failed:", err);
    }
  }
}

async function sendToUserType(userType: "admin" | "driver", userId: string | null, payload: PushPayload) {
  if (!ensureConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({
    where: userId ? { userType, userId } : { userType },
  });
  await Promise.all(subs.map((sub) => sendToSubscription(sub, payload)));
}

export function pushToDriver(driverId: string, payload: PushPayload) {
  return sendToUserType("driver", driverId, payload);
}

export function pushToAllDrivers(payload: PushPayload) {
  return sendToUserType("driver", null, payload);
}

export function pushToAllAdmins(payload: PushPayload) {
  return sendToUserType("admin", null, payload);
}
