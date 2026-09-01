const TARGET_TYPES = new Set([
  "order",
  "payment",
  "product",
  "product_question",
  "return_request",
  "review",
  "seller_application",
  "shipment",
  "store",
  "support_thread",
]);

const POSITIVE_INTEGER = /^[1-9]\d*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const WEB_PUSH_STATE = Object.freeze({
  NOT_SUPPORTED: "NOT_SUPPORTED",
  NOT_REQUESTED: "NOT_REQUESTED",
  ENABLED: "ENABLED",
  DENIED: "DENIED",
  ERROR: "ERROR",
  UNSUBSCRIBED: "UNSUBSCRIBED",
});

export const normalizeNotificationTarget = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entityType = String(value.entityType ?? value.entity_type ?? "").trim().toLowerCase();
  if (!TARGET_TYPES.has(entityType)) return null;
  const rawEntityId = String(value.entityId ?? value.entity_id ?? "").trim();
  const rawEntityKey = String(value.entityKey ?? value.entity_key ?? "").trim().toLowerCase();
  if (entityType === "seller_application") {
    return UUID.test(rawEntityKey) && !rawEntityId
      ? Object.freeze({ entityType, entityKey: rawEntityKey })
      : null;
  }
  if (!POSITIVE_INTEGER.test(rawEntityId) || rawEntityKey) return null;
  const entityId = Number(rawEntityId);
  return Number.isSafeInteger(entityId)
    ? Object.freeze({ entityType, entityId })
    : null;
};

export const resolveNotificationTarget = (value, role) => {
  const target = normalizeNotificationTarget(value);
  const surfaceRole = String(role || "").trim().toLowerCase();
  if (!target || !["admin", "customer", "seller"].includes(surfaceRole)) return null;
  if (surfaceRole === "admin") {
    const page = ({
      order: "orders",
      payment: "orders",
      shipment: "orders",
      product: "catalog",
      product_question: "questions",
      return_request: "returns",
      review: "reviews",
      seller_application: "sellerApplications",
      store: "sellerApplications",
      support_thread: "support",
    })[target.entityType] || null;
    if (!page) return null;
    const params = new URLSearchParams({ notificationTarget: target.entityType });
    if (target.entityKey) params.set("notificationTargetKey", target.entityKey);
    else params.set("notificationTargetId", String(target.entityId));
    return `/admin-commerce-pro-live.html#/${page}?${params.toString()}`;
  }
  if (surfaceRole === "customer") {
    if (["order", "payment", "shipment"].includes(target.entityType)) return `#/hesabim/siparisler/${target.entityId}`;
    if (target.entityType === "return_request") return "#/hesabim/siparisler";
    if (target.entityType === "product") return `#/urun-id/${target.entityId}`;
    if (target.entityType === "support_thread") return "#/destek";
    if (target.entityType === "product_question") return "#/hesabim/sorularim";
    if (target.entityType === "review") return "#/hesabim/degerlendirmelerim";
    return "#/hesabim/bildirimler";
  }
  return target;
};

const decodeVapidPublicKey = (value) => {
  const normalized = String(value || "").trim().replaceAll("-", "+").replaceAll("_", "/");
  if (!normalized) throw new Error("Web Push açık anahtarı eksik.");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = globalThis.atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

const supported = (navigatorRef, NotificationRef) => Boolean(
  navigatorRef?.serviceWorker
  && globalThis.PushManager
  && NotificationRef
  && typeof NotificationRef.requestPermission === "function"
);

const result = (state, extra = {}) => Object.freeze({ state, ...extra });

export const createWebPushController = ({
  api,
  navigatorRef = globalThis.navigator,
  NotificationRef = globalThis.Notification,
  serviceWorkerPath = "/novastore-notification-sw.js",
} = {}) => {
  if (!api || ["getConfig", "getSubscriptionState", "registerSubscription", "revokeSubscription"]
    .some((method) => typeof api[method] !== "function")) {
    throw new TypeError("Web Push API sözleşmesi eksik.");
  }

  const getRegistration = async () => navigatorRef.serviceWorker.register(serviceWorkerPath, { scope: "/" });

  const getState = async () => {
    if (!supported(navigatorRef, NotificationRef)) return result(WEB_PUSH_STATE.NOT_SUPPORTED);
    if (NotificationRef.permission === "denied") return result(WEB_PUSH_STATE.DENIED);
    try {
      const [config, serverState] = await Promise.all([api.getConfig(), api.getSubscriptionState()]);
      if (!config?.configured || !config?.publicKey) {
        return result(WEB_PUSH_STATE.ERROR, { code: "WEB_PUSH_CONFIGURATION_REQUIRED" });
      }
      const registration = await getRegistration();
      const browserSubscription = await registration.pushManager.getSubscription();
      if (serverState?.enabled && browserSubscription) {
        return result(WEB_PUSH_STATE.ENABLED, { activeDeviceCount: Number(serverState.activeDeviceCount || 1) });
      }
      if (NotificationRef.permission === "default") return result(WEB_PUSH_STATE.NOT_REQUESTED);
      return result(WEB_PUSH_STATE.UNSUBSCRIBED, { activeDeviceCount: Number(serverState?.activeDeviceCount || 0) });
    } catch (error) {
      return result(WEB_PUSH_STATE.ERROR, { code: error?.code || "WEB_PUSH_STATE_FAILED" });
    }
  };

  const enable = async () => {
    if (!supported(navigatorRef, NotificationRef)) return result(WEB_PUSH_STATE.NOT_SUPPORTED);
    const config = await api.getConfig();
    if (!config?.configured || !config?.publicKey) {
      return result(WEB_PUSH_STATE.ERROR, { code: "WEB_PUSH_CONFIGURATION_REQUIRED" });
    }
    const permission = NotificationRef.permission === "granted"
      ? "granted"
      : await NotificationRef.requestPermission();
    if (permission === "denied") return result(WEB_PUSH_STATE.DENIED);
    if (permission !== "granted") return result(WEB_PUSH_STATE.NOT_REQUESTED);
    try {
      const registration = await getRegistration();
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(config.publicKey),
      });
      await api.registerSubscription(subscription.toJSON());
      const state = await api.getSubscriptionState();
      return result(WEB_PUSH_STATE.ENABLED, { activeDeviceCount: Number(state?.activeDeviceCount || 1) });
    } catch (error) {
      return result(WEB_PUSH_STATE.ERROR, { code: error?.code || error?.name || "WEB_PUSH_ENABLE_FAILED" });
    }
  };

  const disable = async () => {
    if (!supported(navigatorRef, NotificationRef)) return result(WEB_PUSH_STATE.NOT_SUPPORTED);
    try {
      const registration = await getRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.revokeSubscription({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      return result(WEB_PUSH_STATE.UNSUBSCRIBED);
    } catch (error) {
      return result(WEB_PUSH_STATE.ERROR, { code: error?.code || error?.name || "WEB_PUSH_DISABLE_FAILED" });
    }
  };

  return Object.freeze({ disable, enable, getState });
};

export const notificationClientContract = Object.freeze({
  targetTypes: Object.freeze([...TARGET_TYPES]),
  serviceWorkerPath: "/novastore-notification-sw.js",
});
