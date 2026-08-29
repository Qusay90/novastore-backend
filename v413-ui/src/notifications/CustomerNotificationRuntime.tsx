import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import {
  PushNotifications,
  type ActionPerformed,
  type PushNotificationSchema,
} from "@capacitor/push-notifications";
import {
  ANDROID_FCM_TOKEN_KEY,
  ANDROID_PERMISSION_REQUESTED_KEY,
  authorizeCustomerNotificationTarget,
  CustomerNotificationApiError,
  currentFcmToken,
  getCustomerUnreadCount,
  getNativeNotificationCapability,
  hasVerifiedCustomerSession,
  listCustomerNotifications,
  loginCustomer,
  logoutCustomer,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
  openNativeNotificationSettings,
  pushRevocationSatisfied,
  registerFcmToken,
  revokeFcmSession,
  revokeFcmToken,
} from "./customerNotificationApi";
import {
  normalizeCustomerPushPayload,
  type CustomerNotification,
  type CustomerPushPayload,
  type CustomerNotificationTarget,
} from "./notificationContract";

export type NotificationFeedPhase = "guest" | "idle" | "loading" | "ready" | "empty" | "offline" | "error";
export type AndroidPushState =
  | "not-supported"
  | "not-requested"
  | "enabling"
  | "enabled"
  | "denied"
  | "settings-required"
  | "provider-unavailable"
  | "server-gate"
  | "error";

type NotificationRuntimeValue = Readonly<{
  sessionAvailable: boolean;
  phase: NotificationFeedPhase;
  items: readonly CustomerNotification[];
  unreadCount: number;
  errorMessage: string;
  pushState: AndroidPushState;
  pushStatusText: string;
  refresh(): Promise<void>;
  markRead(id: number): Promise<void>;
  markAllRead(): Promise<void>;
  enablePush(): Promise<void>;
  disablePush(): Promise<void>;
  openPushSettings(): Promise<void>;
  authorizeTarget(target: CustomerNotificationTarget | null): Promise<CustomerNotificationTarget | null>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
}>;

const NotificationRuntimeContext = createContext<NotificationRuntimeValue | null>(null);
const PUSH_STATUS_TEXT: Record<AndroidPushState, string> = Object.freeze({
  "not-supported": "Bu cihaz sistem bildirimlerini desteklemiyor.",
  "not-requested": "Sistem bildirimleri kapalı. İstersen güvenli biçimde açabilirsin.",
  enabling: "Sistem bildirimleri etkinleştiriliyor…",
  enabled: "Sistem bildirimleri bu cihazda açık.",
  denied: "Bildirim izni verilmedi.",
  "settings-required": "Bildirimler sistem ayarlarından kapatılmış. Açmak için ayarlara git.",
  "provider-unavailable": "Firebase/FCM cihaz yapılandırması bekleniyor.",
  "server-gate": "Cihaz hazır; PC1 Android token ucu yapılandırması bekleniyor.",
  error: "Sistem bildirimi durumu doğrulanamadı.",
});

function pushData(notification: PushNotificationSchema) {
  const data = notification.data && typeof notification.data === "object" ? notification.data as Record<string, unknown> : {};
  return {
    notificationId: data.notificationId ?? data.notification_id,
    type: data.type,
    category: data.category,
    priority: data.priority,
    title: data.title ?? notification.title,
    body: data.body ?? notification.body,
    target: data.target,
    entityType: data.entityType ?? data.entity_type,
    entityId: data.entityId ?? data.entity_id,
    entityKey: data.entityKey ?? data.entity_key,
  };
}

function notificationOpenEvent(notificationId: number | null, target: CustomerNotificationTarget | null) {
  return new CustomEvent("novastore:notification-open", {
    detail: { notificationId, target },
  });
}

function isOffline(error: unknown) {
  return !globalThis.navigator?.onLine
    || (error instanceof CustomerNotificationApiError && error.code === "CUSTOMER_NOTIFICATION_NETWORK_ERROR");
}

function providerGate(error: unknown) {
  return error instanceof CustomerNotificationApiError
    && ([404, 410, 501].includes(error.status) || error.code.includes("NOT_FOUND"));
}

async function retireOrphanedPushDelivery() {
  try {
    await PushNotifications.unregister();
    globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function useCustomerNotificationRuntime() {
  return useContext(NotificationRuntimeContext);
}

export default function CustomerNotificationRuntime({ children }: PropsWithChildren) {
  const native = Capacitor.isNativePlatform();
  const [sessionAvailable, setSessionAvailable] = useState(hasVerifiedCustomerSession);
  const [phase, setPhase] = useState<NotificationFeedPhase>(() => hasVerifiedCustomerSession() ? "idle" : "guest");
  const [items, setItems] = useState<readonly CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [pushState, setPushState] = useState<AndroidPushState>(native ? "not-requested" : "not-supported");
  const [inAppPayload, setInAppPayload] = useState<CustomerPushPayload | null>(null);
  const refreshSequence = useRef(0);
  const receivedIds = useRef(new Set<number>());
  const inAppTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!hasVerifiedCustomerSession()) {
      setSessionAvailable(false);
      setPhase("guest");
      setItems([]);
      setUnreadCount(0);
      return;
    }
    if (!globalThis.navigator?.onLine) {
      setPhase("offline");
      setErrorMessage("Çevrimdışısın. Son bildirimler güncellenemedi.");
      return;
    }
    const sequence = ++refreshSequence.current;
    setSessionAvailable(true);
    setPhase("loading");
    setErrorMessage("");
    try {
      const [page, count] = await Promise.all([listCustomerNotifications(), getCustomerUnreadCount()]);
      if (sequence !== refreshSequence.current) return;
      setItems(page.items);
      setUnreadCount(count);
      setPhase(page.items.length ? "ready" : "empty");
    } catch (error) {
      if (sequence !== refreshSequence.current) return;
      if (error instanceof CustomerNotificationApiError && error.status === 401) {
        const pushRetired = !native || !currentFcmToken() || await retireOrphanedPushDelivery();
        setSessionAvailable(false);
        setItems([]);
        setUnreadCount(0);
        setPhase("guest");
        if (native) setPushState(pushRetired ? "not-requested" : "error");
        return;
      }
      setPhase(isOffline(error) ? "offline" : "error");
      setErrorMessage(isOffline(error)
        ? "Çevrimdışısın. Bağlantı geldiğinde yeniden deneyebilirsin."
        : "Bildirimler şu anda yüklenemedi. Tekrar deneyebilirsin.");
    }
  }, [native]);

  const markRead = useCallback(async (id: number) => {
    const updated = await markCustomerNotificationRead(id);
    setItems((current) => current.map((item) => item.id === id ? updated : item));
    setUnreadCount(await getCustomerUnreadCount());
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllCustomerNotificationsRead();
    setItems((current) => current.map((item) => item.isRead ? item : Object.freeze({ ...item, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  const inspectPushState = useCallback(async () => {
    if (!native) {
      setPushState("not-supported");
      return;
    }
    try {
      const capability = await getNativeNotificationCapability();
      if (!capability.providerConfigured) {
        setPushState("provider-unavailable");
        return;
      }
      const permission = await PushNotifications.checkPermissions();
      if (permission.receive === "granted" && capability.notificationsEnabled) {
        setPushState(currentFcmToken() ? "enabled" : "not-requested");
        return;
      }
      if (!capability.notificationsEnabled && globalThis.localStorage?.getItem?.(ANDROID_PERMISSION_REQUESTED_KEY) === "true") {
        setPushState("settings-required");
        return;
      }
      setPushState(permission.receive === "denied" ? "denied" : "not-requested");
    } catch {
      setPushState("error");
    }
  }, [native]);

  const enablePush = useCallback(async () => {
    if (!native || !hasVerifiedCustomerSession()) {
      setPushState(native ? "error" : "not-supported");
      return;
    }
    setPushState("enabling");
    try {
      const capability = await getNativeNotificationCapability();
      if (!capability.providerConfigured) {
        setPushState("provider-unavailable");
        return;
      }
      let permission = await PushNotifications.checkPermissions();
      if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
        globalThis.localStorage?.setItem?.(ANDROID_PERMISSION_REQUESTED_KEY, "true");
        permission = await PushNotifications.requestPermissions();
      }
      if (permission.receive !== "granted") {
        setPushState(permission.receive === "denied" ? "settings-required" : "denied");
        return;
      }
      await PushNotifications.createChannel({
        id: "novastore-transactions",
        name: "Sipariş ve hesap bildirimleri",
        description: "Sipariş, ödeme, kargo, iade ve destek güncellemeleri",
        importance: 3,
        visibility: 0,
        vibration: true,
      });
      await PushNotifications.register();
    } catch {
      setPushState("error");
    }
  }, [native]);

  const disablePush = useCallback(async () => {
    if (!native) return;
    const tokenPresent = Boolean(currentFcmToken());
    let serverRevoked = !tokenPresent;
    let providerRevoked = false;
    try { await revokeFcmToken(); serverRevoked = true; } catch { /* provider revocation can still make delivery impossible */ }
    try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* server revocation can still make delivery impossible */ }
    if (!pushRevocationSatisfied(tokenPresent, serverRevoked, providerRevoked)) {
      setPushState("error");
      throw new CustomerNotificationApiError("Bildirim teslim noktası güvenle kaldırılamadı.", 0, "ANDROID_FCM_REVOKE_REQUIRED");
    }
    globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
    setPushState("not-requested");
  }, [native]);

  const login = useCallback(async (email: string, password: string) => {
    await loginCustomer(email, password);
    setSessionAvailable(false);
    setItems([]);
    setUnreadCount(0);
    setPhase("guest");
  }, []);

  const logout = useCallback(async () => {
    if (native) {
      const tokenPresent = Boolean(currentFcmToken());
      let serverRevoked = !tokenPresent;
      let providerRevoked = false;
      try { await revokeFcmSession(); serverRevoked = true; } catch { /* provider revocation can still make delivery impossible */ }
      try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* server revocation can still make delivery impossible */ }
      if (!pushRevocationSatisfied(tokenPresent, serverRevoked, providerRevoked)) {
        throw new CustomerNotificationApiError("Güvenli çıkış için bildirim bağlantısı kaldırılamadı.", 0, "ANDROID_LOGOUT_PUSH_REVOKE_REQUIRED");
      }
      globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
    }
    try { await logoutCustomer(); } catch { /* local session is cleared by logoutCustomer */ }
    setSessionAvailable(false);
    setItems([]);
    setUnreadCount(0);
    setPhase("guest");
    setPushState(native ? "not-requested" : "not-supported");
  }, [native]);

  useEffect(() => {
    void refresh();
    void inspectPushState();
  }, [inspectPushState, refresh]);

  useEffect(() => {
    const onOnline = () => { if (hasVerifiedCustomerSession()) void refresh(); };
    const onOffline = () => {
      setPhase("offline");
      setErrorMessage("Çevrimdışısın. Son bildirimler güncellenemedi.");
    };
    const onRefresh = () => { if (hasVerifiedCustomerSession()) void refresh(); };
    const onAuthRequired = () => {
      setSessionAvailable(false);
      setItems([]);
      setUnreadCount(0);
      setPhase("guest");
      if (native && currentFcmToken()) {
        void retireOrphanedPushDelivery().then((retired) => setPushState(retired ? "not-requested" : "error"));
      }
    };
    const onVerified = () => {
      if (!hasVerifiedCustomerSession()) return;
      const activate = async () => {
        if (native && currentFcmToken()) {
          try {
            await registerFcmToken(currentFcmToken());
          } catch (error) {
            let providerRevoked = false;
            try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* handled below */ }
            if (providerRevoked) globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
            else {
              try { await logoutCustomer(); } catch { /* local session is still cleared */ }
              throw error;
            }
          }
        }
        setSessionAvailable(true);
        await refresh();
        await inspectPushState();
      };
      void activate().catch(() => {
        setSessionAvailable(false);
        setItems([]);
        setUnreadCount(0);
        setPhase("error");
        setErrorMessage("Müşteri bildirim oturumu güvenle başlatılamadı.");
      });
    };
    globalThis.addEventListener("online", onOnline);
    globalThis.addEventListener("offline", onOffline);
    globalThis.addEventListener("novastore:notification-refresh", onRefresh);
    globalThis.addEventListener("novastore:auth-required", onAuthRequired);
    globalThis.addEventListener("novastore:auth-verified", onVerified);
    return () => {
      globalThis.removeEventListener("online", onOnline);
      globalThis.removeEventListener("offline", onOffline);
      globalThis.removeEventListener("novastore:notification-refresh", onRefresh);
      globalThis.removeEventListener("novastore:auth-required", onAuthRequired);
      globalThis.removeEventListener("novastore:auth-verified", onVerified);
    };
  }, [inspectPushState, native, refresh]);

  useEffect(() => {
    if (!native) return;
    let active = true;
    const handles: PluginListenerHandle[] = [];
    const keep = (promise: Promise<PluginListenerHandle>) => {
      void promise.then((handle) => { if (active) handles.push(handle); else void handle.remove(); });
    };
    keep(PushNotifications.addListener("registration", (registration) => {
      if (!hasVerifiedCustomerSession()) {
        void retireOrphanedPushDelivery();
        setPushState("error");
        return;
      }
      const previous = currentFcmToken();
      void registerFcmToken(registration.value, previous)
        .then(() => setPushState("enabled"))
        .catch((error) => setPushState(providerGate(error) ? "server-gate" : "error"));
    }));
    keep(PushNotifications.addListener("registrationError", () => setPushState("provider-unavailable")));
    keep(PushNotifications.addListener("pushNotificationReceived", (notification) => {
      if (!hasVerifiedCustomerSession()) {
        void retireOrphanedPushDelivery();
        return;
      }
      const payload = normalizeCustomerPushPayload(pushData(notification));
      if (!payload || receivedIds.current.has(payload.notificationId)) return;
      receivedIds.current.add(payload.notificationId);
      setInAppPayload(payload);
      if (inAppTimer.current !== null) globalThis.clearTimeout(inAppTimer.current);
      inAppTimer.current = globalThis.setTimeout(() => setInAppPayload(null), 5_000);
      void refresh();
    }));
    keep(PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
      const payload = normalizeCustomerPushPayload(pushData(action.notification));
      if (!payload || !hasVerifiedCustomerSession()) {
        if (!hasVerifiedCustomerSession()) void retireOrphanedPushDelivery();
        globalThis.dispatchEvent(notificationOpenEvent(null, null));
        return;
      }
      void Promise.all([
        markCustomerNotificationRead(payload.notificationId).catch(() => undefined),
        authorizeCustomerNotificationTarget(payload.target).catch(() => null),
      ]).then(([, target]) => {
        void refresh();
        globalThis.dispatchEvent(notificationOpenEvent(payload.notificationId, target));
      });
    }));
    return () => {
      active = false;
      for (const handle of handles) void handle.remove();
      if (inAppTimer.current !== null) globalThis.clearTimeout(inAppTimer.current);
    };
  }, [native, refresh]);

  const value = useMemo<NotificationRuntimeValue>(() => Object.freeze({
    sessionAvailable,
    phase,
    items,
    unreadCount,
    errorMessage,
    pushState,
    pushStatusText: PUSH_STATUS_TEXT[pushState],
    refresh,
    markRead,
    markAllRead,
    enablePush,
    disablePush,
    openPushSettings: openNativeNotificationSettings,
    authorizeTarget: authorizeCustomerNotificationTarget,
    login,
    logout,
  }), [sessionAvailable, phase, items, unreadCount, errorMessage, pushState, refresh, markRead, markAllRead, enablePush, disablePush, login, logout]);

  return (
    <NotificationRuntimeContext.Provider value={value}>
      {children}
      {inAppPayload && (
        <div className="notification-in-app" role="status" aria-live="polite" aria-atomic="true">
          <b>{inAppPayload.title}</b><span>{inAppPayload.body}</span>
        </div>
      )}
    </NotificationRuntimeContext.Provider>
  );
}
