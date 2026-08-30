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
  currentCustomerSessionGuard,
  customerSessionMatchesGuard,
  CustomerNotificationApiError,
  currentFcmToken,
  getCustomerUnreadCount,
  getNativeNotificationCapability,
  hasCustomerSession,
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

let pushProviderRestoreRequired = false;
let pushProviderIntentEpoch = 0;
let disabledPushProviderGuard: Readonly<{
  epoch: number;
  guard: ReturnType<typeof currentCustomerSessionGuard>;
}> | null = null;
let pendingPushRegistration: Readonly<{
  guard: ReturnType<typeof currentCustomerSessionGuard>;
  token: string;
  predecessor: string | undefined;
}> | null = null;
type PushProviderRestoreFlight = Readonly<{
  guard: ReturnType<typeof currentCustomerSessionGuard>;
  intentEpoch: number;
  promise: Promise<boolean>;
  settle: (registered: boolean) => void;
}>;
type PendingNotificationAction = Readonly<{
  guard: ReturnType<typeof currentCustomerSessionGuard>;
  payload: CustomerPushPayload;
}>;
let pushProviderRestoreFlight: PushProviderRestoreFlight | null = null;

function pushProviderDisabledForCurrentSession() {
  return Boolean(
    disabledPushProviderGuard
    && disabledPushProviderGuard.epoch === pushProviderIntentEpoch
    && customerSessionMatchesGuard(disabledPushProviderGuard.guard),
  );
}

function settlePushProviderRestore(registered: boolean) {
  const flight = pushProviderRestoreFlight;
  if (!flight) {
    if (!registered) pushProviderRestoreRequired = true;
    return false;
  }
  flight.settle(
    registered
    && flight.intentEpoch === pushProviderIntentEpoch
    && !pushProviderDisabledForCurrentSession()
    && customerSessionMatchesGuard(flight.guard),
  );
  return true;
}

async function restoreCurrentPushProvider() {
  if (
    pushProviderDisabledForCurrentSession()
    || !hasCustomerSession()
    || (!currentFcmToken() && !pendingPushRegistration)
  ) return false;
  if (pushProviderRestoreFlight && customerSessionMatchesGuard(pushProviderRestoreFlight.guard)) {
    return pushProviderRestoreFlight.promise;
  }
  pushProviderRestoreFlight?.settle(false);
  const guard = currentCustomerSessionGuard();
  let resolveFlight!: (registered: boolean) => void;
  const promise = new Promise<boolean>((resolve) => { resolveFlight = resolve; });
  let timeoutId: number | undefined;
  const flight: PushProviderRestoreFlight = Object.freeze({
    guard,
    intentEpoch: pushProviderIntentEpoch,
    promise,
    settle(registered: boolean) {
      if (pushProviderRestoreFlight !== flight) return;
      pushProviderRestoreFlight = null;
      if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
      pushProviderRestoreRequired = !registered;
      resolveFlight(registered);
    },
  });
  pushProviderRestoreFlight = flight;
  timeoutId = globalThis.setTimeout(() => flight.settle(false), 10_000);
  pushProviderRestoreRequired = true;
  try {
    await PushNotifications.register();
  } catch {
    flight.settle(false);
  }
  return promise;
}

async function retireDisabledPushRegistration(token: string) {
  const cleanupEpoch = pushProviderIntentEpoch;
  const cleanupIntent = disabledPushProviderGuard;
  const cleanupStillCurrent = () => pushProviderIntentEpoch === cleanupEpoch
    && disabledPushProviderGuard === cleanupIntent
    && pushProviderDisabledForCurrentSession();
  const restoreAfterStaleCleanup = async () => {
    if (!cleanupStillCurrent() && hasCustomerSession() && currentFcmToken() && !pushProviderDisabledForCurrentSession()) {
      pushProviderRestoreRequired = true;
      return restoreCurrentPushProvider();
    }
    return false;
  };
  let serverRevoked = false;
  let providerRevoked = false;
  try { await revokeFcmToken(token, () => false); serverRevoked = true; } catch { /* provider revoke remains a safe fallback */ }
  if (!cleanupStillCurrent()) return restoreAfterStaleCleanup();
  try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* server revoke remains a safe fallback */ }
  if (!cleanupStillCurrent()) return restoreAfterStaleCleanup();
  if (!pushRevocationSatisfied(true, serverRevoked, providerRevoked)) {
    throw new CustomerNotificationApiError("Geç bildirim kaydı güvenle kaldırılamadı.", 0, "ANDROID_FCM_LATE_BIND_CLEANUP_REQUIRED");
  }
  if (currentFcmToken() === token) globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
  return false;
}

async function bindPushRegistration(pending: NonNullable<typeof pendingPushRegistration>) {
  if (pushProviderDisabledForCurrentSession() || !customerSessionMatchesGuard(pending.guard)) return false;
  await registerFcmToken(pending.token, pending.predecessor);
  if (pushProviderDisabledForCurrentSession()) {
    return retireDisabledPushRegistration(pending.token);
  }
  return customerSessionMatchesGuard(pending.guard);
}

async function retireOrphanedPushDelivery(guard = currentCustomerSessionGuard()) {
  try {
    pushProviderRestoreRequired = true;
    await PushNotifications.unregister();
    if (!customerSessionMatchesGuard(guard) && hasCustomerSession()) {
      // A newer login appeared while the old provider endpoint was being
      // retired. Re-register even during its pre-/me window so the stale
      // continuation cannot disable the new generation's shared provider.
      await restoreCurrentPushProvider();
      return false;
    }
    globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
    pendingPushRegistration = null;
    pushProviderRestoreRequired = false;
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
  const pendingNotificationAction = useRef<PendingNotificationAction | null>(null);

  const clearPrivateNotificationState = useCallback((nextPhase: NotificationFeedPhase = "guest") => {
    ++refreshSequence.current;
    setSessionAvailable(false);
    setItems([]);
    setUnreadCount(0);
    setErrorMessage("");
    setInAppPayload(null);
    receivedIds.current.clear();
    if (inAppTimer.current !== null) {
      globalThis.clearTimeout(inAppTimer.current);
      inAppTimer.current = null;
    }
    setPhase(nextPhase);
  }, []);

  const refresh = useCallback(async () => {
    if (!hasVerifiedCustomerSession()) {
      clearPrivateNotificationState();
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
      if (sequence !== refreshSequence.current || !hasVerifiedCustomerSession()) return;
      setItems(page.items);
      setUnreadCount(count);
      setPhase(page.items.length ? "ready" : "empty");
    } catch (error) {
      if (sequence !== refreshSequence.current) return;
      if (error instanceof CustomerNotificationApiError && error.status === 401) {
        const guard = currentCustomerSessionGuard();
        const pushRetired = !native || !currentFcmToken() || await retireOrphanedPushDelivery(guard);
        if (sequence !== refreshSequence.current) return;
        clearPrivateNotificationState();
        if (native) setPushState(pushRetired ? "not-requested" : "error");
        return;
      }
      setPhase(isOffline(error) ? "offline" : "error");
      setErrorMessage(isOffline(error)
        ? "Çevrimdışısın. Bağlantı geldiğinde yeniden deneyebilirsin."
        : "Bildirimler şu anda yüklenemedi. Tekrar deneyebilirsin.");
    }
  }, [clearPrivateNotificationState, native]);

  const markRead = useCallback(async (id: number) => {
    const sequence = refreshSequence.current;
    const updated = await markCustomerNotificationRead(id);
    if (sequence !== refreshSequence.current || !hasVerifiedCustomerSession()) return;
    setItems((current) => current.map((item) => item.id === id ? updated : item));
    const count = await getCustomerUnreadCount();
    if (sequence !== refreshSequence.current || !hasVerifiedCustomerSession()) return;
    setUnreadCount(count);
  }, []);

  const markAllRead = useCallback(async () => {
    const sequence = refreshSequence.current;
    await markAllCustomerNotificationsRead();
    if (sequence !== refreshSequence.current || !hasVerifiedCustomerSession()) return;
    setItems((current) => current.map((item) => item.isRead ? item : Object.freeze({ ...item, isRead: true, readAt: new Date().toISOString() })));
    setUnreadCount(0);
  }, []);

  const openNotificationAction = useCallback(async (pending: PendingNotificationAction) => {
    if (!hasVerifiedCustomerSession() || !customerSessionMatchesGuard(pending.guard)) return;
    const [, target] = await Promise.all([
      markCustomerNotificationRead(pending.payload.notificationId).catch(() => undefined),
      authorizeCustomerNotificationTarget(pending.payload.target).catch(() => null),
    ]);
    if (!hasVerifiedCustomerSession() || !customerSessionMatchesGuard(pending.guard)) return;
    void refresh();
    globalThis.dispatchEvent(notificationOpenEvent(pending.payload.notificationId, target));
  }, [refresh]);

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
    const enableGuard = currentCustomerSessionGuard();
    const enableEpoch = ++pushProviderIntentEpoch;
    disabledPushProviderGuard = null;
    pushProviderRestoreFlight?.settle(false);
    pushProviderRestoreRequired = false;
    const stillCurrent = () => pushProviderIntentEpoch === enableEpoch
      && !pushProviderDisabledForCurrentSession()
      && customerSessionMatchesGuard(enableGuard);
    setPushState("enabling");
    try {
      const capability = await getNativeNotificationCapability();
      if (!stillCurrent()) return;
      if (!capability.providerConfigured) {
        setPushState("provider-unavailable");
        return;
      }
      let permission = await PushNotifications.checkPermissions();
      if (!stillCurrent()) return;
      if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
        globalThis.localStorage?.setItem?.(ANDROID_PERMISSION_REQUESTED_KEY, "true");
        permission = await PushNotifications.requestPermissions();
        if (!stillCurrent()) return;
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
      if (!stillCurrent()) return;
      await PushNotifications.register();
    } catch {
      if (stillCurrent()) setPushState("error");
    }
  }, [native]);

  const disablePush = useCallback(async () => {
    if (!native) return;
    const disabledGuard = currentCustomerSessionGuard();
    const disableEpoch = ++pushProviderIntentEpoch;
    const disabledIntent = Object.freeze({ epoch: disableEpoch, guard: disabledGuard });
    disabledPushProviderGuard = disabledIntent;
    pushProviderRestoreFlight?.settle(false);
    pushProviderRestoreRequired = false;
    pendingPushRegistration = null;
    const stillCurrent = () => pushProviderIntentEpoch === disableEpoch
      && disabledPushProviderGuard === disabledIntent
      && customerSessionMatchesGuard(disabledGuard);
    const restoreAfterStaleContinuation = async () => {
      if (!stillCurrent() && hasCustomerSession() && currentFcmToken() && !pushProviderDisabledForCurrentSession()) {
        pushProviderRestoreRequired = true;
        await restoreCurrentPushProvider();
      }
    };
    const token = currentFcmToken();
    const tokenPresent = Boolean(token);
    let serverRevoked = !tokenPresent;
    let providerRevoked = false;
    try { await revokeFcmToken(token ?? undefined, stillCurrent); serverRevoked = true; } catch { /* provider revocation can still make delivery impossible */ }
    if (!stillCurrent()) {
      await restoreAfterStaleContinuation();
      return;
    }
    try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* server revocation can still make delivery impossible */ }
    if (!stillCurrent()) {
      await restoreAfterStaleContinuation();
      return;
    }
    if (!pushRevocationSatisfied(tokenPresent, serverRevoked, providerRevoked)) {
      setPushState("error");
      throw new CustomerNotificationApiError("Bildirim teslim noktası güvenle kaldırılamadı.", 0, "ANDROID_FCM_REVOKE_REQUIRED");
    }
    if (!token || currentFcmToken() === token) globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
    setPushState("not-requested");
  }, [native]);

  const login = useCallback(async (email: string, password: string) => {
    pendingNotificationAction.current = null;
    clearPrivateNotificationState();
    await loginCustomer(email, password);
  }, [clearPrivateNotificationState]);

  const logout = useCallback(async () => {
    const guard = currentCustomerSessionGuard();
    pendingNotificationAction.current = null;
    pendingPushRegistration = null;
    clearPrivateNotificationState();
    if (native) {
      const tokenPresent = Boolean(currentFcmToken());
      let serverRevoked = !tokenPresent;
      let providerRevoked = false;
      try { await revokeFcmSession(guard); serverRevoked = true; } catch { /* provider revocation can still make delivery impossible */ }
      if (!customerSessionMatchesGuard(guard)) {
        throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
      }
      try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* server revocation can still make delivery impossible */ }
      if (!customerSessionMatchesGuard(guard)) {
        // The provider operation raced with a new Customer login. Restore the
        // current generation even while /me verification is still pending.
        if (!await restoreCurrentPushProvider()) setPushState("error");
        throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
      }
      if (!pushRevocationSatisfied(tokenPresent, serverRevoked, providerRevoked)) {
        throw new CustomerNotificationApiError("Güvenli çıkış için bildirim bağlantısı kaldırılamadı.", 0, "ANDROID_LOGOUT_PUSH_REVOKE_REQUIRED");
      }
      globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
    }
    try {
      await logoutCustomer(guard);
    } catch (error) {
      // A server-side logout failure is safe to tolerate only after the local
      // secure generation was actually cleared. Never report guest while a
      // restorable Keystore session still exists.
      if (hasCustomerSession()) throw error;
    }
    clearPrivateNotificationState();
    setPushState(native ? "not-requested" : "not-supported");
  }, [clearPrivateNotificationState, native]);

  useEffect(() => {
    void refresh();
    void inspectPushState();
  }, [inspectPushState, refresh]);

  useEffect(() => {
    const onOnline = () => { if (hasVerifiedCustomerSession()) void refresh(); };
    const onOffline = () => {
      if (hasVerifiedCustomerSession()) {
        setPhase("offline");
        setErrorMessage("Çevrimdışısın. Son bildirimler güncellenemedi.");
      } else {
        clearPrivateNotificationState();
      }
    };
    const onRefresh = () => { if (hasVerifiedCustomerSession()) void refresh(); };
    const onAuthRequired = () => {
      pendingNotificationAction.current = null;
      pendingPushRegistration = null;
      clearPrivateNotificationState();
      if (native && currentFcmToken()) {
        const guard = currentCustomerSessionGuard();
        void retireOrphanedPushDelivery(guard).then((retired) => {
          if (!customerSessionMatchesGuard(guard) && hasCustomerSession()) return;
          setPushState(retired ? "not-requested" : "error");
        });
      }
    };
    const onAuthUnverified = () => {
      clearPrivateNotificationState(globalThis.navigator?.onLine ? "error" : "offline");
      setErrorMessage("Müşteri oturumu yeniden doğrulanana kadar özel bildirimler gizlendi.");
    };
    const onVerified = () => {
      if (!hasVerifiedCustomerSession()) return;
      const guard = currentCustomerSessionGuard();
      const pending = pendingNotificationAction.current;
      pendingNotificationAction.current = null;
      if (pending) void openNotificationAction(pending);
      const activate = async () => {
        if (native && !pushProviderDisabledForCurrentSession() && (currentFcmToken() || pendingPushRegistration)) {
          const restorationWasRequired = pushProviderRestoreRequired;
          if (restorationWasRequired) {
            const restored = await restoreCurrentPushProvider();
            if (!customerSessionMatchesGuard(guard)) return;
            if (!restored) {
              pendingPushRegistration = null;
              pushProviderRestoreRequired = true;
              throw new CustomerNotificationApiError("Bildirim sağlayıcısı yeniden kaydedilemedi.", 0, "ANDROID_FCM_PROVIDER_RESTORE_REQUIRED");
            }
          }
          try {
            const pending = pendingPushRegistration;
            if (pending && customerSessionMatchesGuard(pending.guard)) {
              await bindPushRegistration(pending);
              if (customerSessionMatchesGuard(guard) && pendingPushRegistration === pending) pendingPushRegistration = null;
            } else if (!restorationWasRequired) {
              const durableToken = currentFcmToken();
              if (!durableToken) throw new CustomerNotificationApiError("Bildirim teslim anahtarı bulunamadı.", 0, "ANDROID_FCM_TOKEN_MISSING");
              await bindPushRegistration(Object.freeze({ guard, token: durableToken, predecessor: undefined }));
            }
          } catch (error) {
            if (!customerSessionMatchesGuard(guard)) return;
            if (
              error instanceof CustomerNotificationApiError
              && error.code === "ANDROID_FCM_LATE_BIND_CLEANUP_REQUIRED"
              && pushProviderDisabledForCurrentSession()
            ) {
              pushProviderRestoreRequired = false;
              setPushState("error");
            } else {
              let providerRevoked = false;
              try { await PushNotifications.unregister(); providerRevoked = true; } catch { /* handled below */ }
              if (!customerSessionMatchesGuard(guard)) {
                if (!await restoreCurrentPushProvider()) setPushState("error");
                return;
              }
              if (providerRevoked) {
                pendingPushRegistration = null;
                pushProviderRestoreRequired = true;
                globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
              } else {
                try {
                  await logoutCustomer(guard);
                } catch (logoutError) {
                  if (hasCustomerSession()) throw logoutError;
                }
                throw error;
              }
            }
          }
        }
        if (!customerSessionMatchesGuard(guard)) return;
        setSessionAvailable(true);
        await refresh();
        await inspectPushState();
      };
      void activate().catch(() => {
        if (!customerSessionMatchesGuard(guard)) return;
        clearPrivateNotificationState("error");
        setErrorMessage("Müşteri bildirim oturumu güvenle başlatılamadı.");
      });
    };
    globalThis.addEventListener("online", onOnline);
    globalThis.addEventListener("offline", onOffline);
    globalThis.addEventListener("novastore:notification-refresh", onRefresh);
    globalThis.addEventListener("novastore:auth-required", onAuthRequired);
    globalThis.addEventListener("novastore:auth-unverified", onAuthUnverified);
    globalThis.addEventListener("novastore:auth-verified", onVerified);
    return () => {
      globalThis.removeEventListener("online", onOnline);
      globalThis.removeEventListener("offline", onOffline);
      globalThis.removeEventListener("novastore:notification-refresh", onRefresh);
      globalThis.removeEventListener("novastore:auth-required", onAuthRequired);
      globalThis.removeEventListener("novastore:auth-unverified", onAuthUnverified);
      globalThis.removeEventListener("novastore:auth-verified", onVerified);
    };
  }, [clearPrivateNotificationState, inspectPushState, native, openNotificationAction, refresh]);

  useEffect(() => {
    if (!native) return;
    let active = true;
    const handles: PluginListenerHandle[] = [];
    const keep = (promise: Promise<PluginListenerHandle>) => {
      void promise.then((handle) => { if (active) handles.push(handle); else void handle.remove(); });
    };
    keep(PushNotifications.addListener("registration", (registration) => {
      if (pushProviderDisabledForCurrentSession()) {
        pendingPushRegistration = null;
        settlePushProviderRestore(false);
        pushProviderRestoreRequired = false;
        // Keep the late token as a cleanup handle until either the PC1
        // endpoint or the device-global provider registration is proven
        // retired. Never report disabled while both gates remain open.
        globalThis.localStorage?.setItem?.(ANDROID_FCM_TOKEN_KEY, registration.value);
        void retireDisabledPushRegistration(registration.value)
          .then((restored) => setPushState(restored ? "enabling" : "not-requested"))
          .catch(() => setPushState("error"));
        return;
      }
      const pending = Object.freeze({
        guard: currentCustomerSessionGuard(),
        token: registration.value,
        predecessor: currentFcmToken() ?? undefined,
      });
      pendingPushRegistration = pending;
      if (!hasVerifiedCustomerSession()) {
        clearPrivateNotificationState();
        // Refresh/login keeps a credential generation while /me is pending.
        // Ignore this transitional callback; terminal auth-required owns
        // provider retirement and prevents a normal rotation from disabling
        // push delivery.
        if (hasCustomerSession()) {
          settlePushProviderRestore(true);
          setPushState("enabling");
        } else {
          pendingPushRegistration = null;
          settlePushProviderRestore(false);
          void retireOrphanedPushDelivery();
          setPushState("error");
        }
        return;
      }
      const restoreFlightPresent = Boolean(pushProviderRestoreFlight);
      void bindPushRegistration(pending)
        .then((bound) => {
          if (pendingPushRegistration === pending) pendingPushRegistration = null;
          if (restoreFlightPresent) settlePushProviderRestore(bound);
          if (pushProviderDisabledForCurrentSession()) pushProviderRestoreRequired = false;
          else if (!restoreFlightPresent) pushProviderRestoreRequired = !bound;
          setPushState(bound ? "enabled" : pushProviderDisabledForCurrentSession() ? "not-requested" : "error");
        })
        .catch((error) => {
          if (restoreFlightPresent) settlePushProviderRestore(false);
          const cleanupRequired = error instanceof CustomerNotificationApiError
            && error.code === "ANDROID_FCM_LATE_BIND_CLEANUP_REQUIRED";
          if (pushProviderDisabledForCurrentSession()) pushProviderRestoreRequired = false;
          setPushState(cleanupRequired ? "error" : pushProviderDisabledForCurrentSession() ? "not-requested" : providerGate(error) ? "server-gate" : "error");
        });
    }));
    keep(PushNotifications.addListener("registrationError", () => {
      const disabled = pushProviderDisabledForCurrentSession();
      pendingPushRegistration = null;
      settlePushProviderRestore(false);
      pushProviderRestoreRequired = !disabled;
      setPushState(disabled ? "not-requested" : "provider-unavailable");
    }));
    keep(PushNotifications.addListener("pushNotificationReceived", (notification) => {
      if (!hasVerifiedCustomerSession()) {
        clearPrivateNotificationState();
        if (!hasCustomerSession()) void retireOrphanedPushDelivery();
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
      if (!payload) {
        globalThis.dispatchEvent(notificationOpenEvent(null, null));
        return;
      }
      const pending = Object.freeze({ guard: currentCustomerSessionGuard(), payload });
      if (!hasVerifiedCustomerSession()) {
        if (hasCustomerSession()) {
          // Android can deliver a notification action before the persisted
          // Customer session finishes its /me verification. Hold the private
          // target behind the exact session-family guard and release it only
          // after that same session is verified.
          pendingNotificationAction.current = pending;
          return;
        }
        pendingNotificationAction.current = null;
        clearPrivateNotificationState();
        void retireOrphanedPushDelivery();
        globalThis.dispatchEvent(notificationOpenEvent(null, null));
        return;
      }
      void openNotificationAction(pending);
    }));
    return () => {
      active = false;
      pendingNotificationAction.current = null;
      for (const handle of handles) void handle.remove();
      if (inAppTimer.current !== null) globalThis.clearTimeout(inAppTimer.current);
    };
  }, [clearPrivateNotificationState, native, openNotificationAction, refresh]);

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
