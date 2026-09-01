"use strict";

const NOTIFICATION_CENTER = Object.freeze({
  admin: "/admin-commerce-pro-live.html#/notifications",
  customer: "/#/hesabim/bildirimler",
  seller: "/seller/#/notifications",
});

const positiveId = (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
};
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(String(value || "").trim());

const safeDestination = (payload = {}) => {
  const role = ["admin", "customer", "seller"].includes(payload.recipientRole)
    ? payload.recipientRole
    : "customer";
  const target = payload.target && typeof payload.target === "object" ? payload.target : null;
  const type = String(target?.entityType || "").toLowerCase();
  const id = positiveId(target?.entityId);
  if (role === "admin") {
    const page = ({
      order: "orders", payment: "orders", shipment: "orders", product: "catalog",
      product_question: "questions", return_request: "returns", review: "reviews",
      seller_application: "sellerApplications", store: "sellerApplications", support_thread: "support",
    })[type];
    if (!page) return NOTIFICATION_CENTER.admin;
    if (type === "seller_application") {
      const key = String(target?.entityKey || "").trim().toLowerCase();
      return uuid(key)
        ? `/admin-commerce-pro-live.html#/${page}?notificationTarget=${type}&notificationTargetKey=${encodeURIComponent(key)}`
        : NOTIFICATION_CENTER.admin;
    }
    return id
      ? `/admin-commerce-pro-live.html#/${page}?notificationTarget=${type}&notificationTargetId=${id}`
      : NOTIFICATION_CENTER.admin;
  }
  if (role === "customer") {
    if (["order", "payment", "shipment"].includes(type) && id) return `/#/hesabim/siparisler/${id}`;
    if (type === "return_request") return "/#/hesabim/siparisler";
    if (type === "product" && id) return `/#/urun-id/${id}`;
    if (type === "support_thread") return "/#/destek";
    if (type === "product_question" && id) return "/#/hesabim/sorularim";
    if (type === "review" && id) return "/#/hesabim/degerlendirmelerim";
  }
  return NOTIFICATION_CENTER[role];
};

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json?.() || {}; } catch (_error) { payload = {}; }
  const title = String(payload.title || "NovaStore bildirimi").slice(0, 120);
  const body = String(payload.body || "Yeni bir bildiriminiz var.").slice(0, 180);
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "/web-app-manifest-192x192.png",
    badge: "/favicon-96x96.png",
    tag: `novastore-${positiveId(payload.notificationId) || "notification"}`,
    renotify: false,
    data: {
      notificationId: positiveId(payload.notificationId),
      recipientRole: ["admin", "customer", "seller"].includes(payload.recipientRole) ? payload.recipientRole : "customer",
      target: payload.target || null,
    },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = safeDestination(event.notification.data);
  event.waitUntil((async () => {
    const targetUrl = new URL(destination, self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const sameOrigin = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (sameOrigin) {
      await sameOrigin.navigate(targetUrl);
      return sameOrigin.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
