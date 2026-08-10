import { apiDelete, apiGet, apiPost } from "./api";

export function getVapidPublicKey() {
  return apiGet<{ publicKey: string }>("/api/push/vapid-public-key");
}

export function subscribePush(subscription: PushSubscriptionJSON) {
  return apiPost<void>("/api/push/subscribe", {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.keys?.p256dh, auth: subscription.keys?.auth },
  });
}

export function unsubscribePush(endpoint: string) {
  return apiDelete<void>("/api/push/subscribe", { endpoint });
}
