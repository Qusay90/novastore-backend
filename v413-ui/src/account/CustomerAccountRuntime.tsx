import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import {
  clearGuardedCustomerSession,
  currentCustomerSessionGuard,
  customerSessionMatchesGuard,
  CustomerNotificationApiError,
  hasCustomerSession,
  markCustomerSessionVerified,
  useCustomerNotificationRuntime,
} from "../notifications";
import {
  createCustomerAddress,
  createCustomerReturn,
  cancelCustomerOrder,
  deleteCustomerAddress,
  getCurrentCustomer,
  getCustomerSecurityStatus,
  listCustomerAddresses,
  listCustomerCoupons,
  listCustomerFollowedStores,
  listCustomerOrders,
  listCustomerQuestions,
  listCustomerReviews,
  listCustomerReturns,
  listCustomerSupportMessages,
  makeDefaultCustomerAddress,
  registerCustomer,
  requestPasswordRecovery,
  sendCustomerSupportMessage,
  updateCustomerAddress,
  updateCustomerProfile,
  type CustomerAddress,
  type CustomerAddressInput,
  type CustomerCoupon,
  type CustomerFollowedStore,
  type CustomerOrder,
  type CustomerProfile,
  type CustomerQuestion,
  type CustomerReview,
  type CustomerReturn,
  type CustomerSecurityStatus,
  type CustomerSupportMessage,
  unfollowCustomerStore,
} from "./customerAccountApi";

export type CustomerAccountPhase = "loading" | "guest" | "authenticated" | "offline" | "error";

type CustomerAccountRuntimeValue = Readonly<{
  phase: CustomerAccountPhase;
  user: CustomerProfile | null;
  addresses: readonly CustomerAddress[];
  coupons: readonly CustomerCoupon[];
  questions: readonly CustomerQuestion[];
  reviews: readonly CustomerReview[];
  followedStores: readonly CustomerFollowedStore[];
  orders: readonly CustomerOrder[];
  returns: readonly CustomerReturn[];
  supportMessages: readonly CustomerSupportMessage[];
  securityStatus: CustomerSecurityStatus | null;
  errorMessage: string;
  dataWarnings: readonly string[];
  busy: boolean;
  refresh(): Promise<void>;
  login(email: string, password: string): Promise<void>;
  register(fullName: string, email: string, password: string): Promise<void>;
  requestPasswordRecovery(email: string): Promise<void>;
  logout(): Promise<void>;
  updateProfile(fullName: string, phone: string): Promise<void>;
  createAddress(value: CustomerAddressInput): Promise<void>;
  updateAddress(id: number, value: CustomerAddressInput): Promise<void>;
  deleteAddress(id: number): Promise<void>;
  setDefaultAddress(id: number): Promise<void>;
  cancelOrder(id: number, expectedStatus: string): Promise<void>;
  createReturn(orderId: number, reasonCode: string, note?: string): Promise<void>;
  refreshFollowedStores(): Promise<void>;
  unfollowStore(storeSlug: string): Promise<void>;
  refreshSupport(): Promise<void>;
  sendSupportMessage(message: string): Promise<void>;
}>;

const CustomerAccountRuntimeContext = createContext<CustomerAccountRuntimeValue | null>(null);

function offline(error: unknown) {
  return !globalThis.navigator?.onLine
    || (error instanceof CustomerNotificationApiError && error.code === "CUSTOMER_NOTIFICATION_NETWORK_ERROR");
}

function warningText(scope: string) {
  return `${scope} şu anda sunucudan alınamadı.`;
}

export function useCustomerAccountRuntime() {
  return useContext(CustomerAccountRuntimeContext);
}

export default function CustomerAccountRuntime({ children }: PropsWithChildren) {
  const notifications = useCustomerNotificationRuntime();
  const [phase, setPhase] = useState<CustomerAccountPhase>("loading");
  const [user, setUser] = useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = useState<readonly CustomerAddress[]>([]);
  const [coupons, setCoupons] = useState<readonly CustomerCoupon[]>([]);
  const [questions, setQuestions] = useState<readonly CustomerQuestion[]>([]);
  const [reviews, setReviews] = useState<readonly CustomerReview[]>([]);
  const [followedStores, setFollowedStores] = useState<readonly CustomerFollowedStore[]>([]);
  const [orders, setOrders] = useState<readonly CustomerOrder[]>([]);
  const [returns, setReturns] = useState<readonly CustomerReturn[]>([]);
  const [supportMessages, setSupportMessages] = useState<readonly CustomerSupportMessage[]>([]);
  const [securityStatus, setSecurityStatus] = useState<CustomerSecurityStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [dataWarnings, setDataWarnings] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const followedStoresLoadSequence = useRef(0);
  const unfollowOperationSequence = useRef(0);

  const clearPrivateState = useCallback(() => {
    setUser(null);
    setAddresses([]);
    setCoupons([]);
    setQuestions([]);
    setReviews([]);
    setFollowedStores([]);
    setOrders([]);
    setReturns([]);
    setSupportMessages([]);
    setSecurityStatus(null);
    setDataWarnings([]);
    setBusy(false);
    ++followedStoresLoadSequence.current;
    ++unfollowOperationSequence.current;
  }, []);

  const loadPrivateData = useCallback(async (profile: CustomerProfile, currentSequence: number) => {
    const results = await Promise.allSettled([
      listCustomerAddresses(),
      listCustomerOrders(profile.id),
      listCustomerReturns(),
      listCustomerSupportMessages(profile.id),
      getCustomerSecurityStatus(),
      listCustomerCoupons(),
      listCustomerQuestions(),
      listCustomerReviews(profile.id),
      listCustomerFollowedStores(),
    ] as const);
    if (sequence.current !== currentSequence) return;
    const warnings: string[] = [];
    const [addressResult, orderResult, returnResult, supportResult, securityResult, couponResult, questionResult, reviewResult, followedStoreResult] = results;
    if (addressResult.status === "fulfilled") setAddresses(addressResult.value); else { setAddresses([]); warnings.push(warningText("Adresler")); }
    if (orderResult.status === "fulfilled") setOrders(orderResult.value); else { setOrders([]); warnings.push(warningText("Siparişler")); }
    if (returnResult.status === "fulfilled") setReturns(returnResult.value); else { setReturns([]); warnings.push(warningText("İadeler")); }
    if (supportResult.status === "fulfilled") setSupportMessages(supportResult.value); else { setSupportMessages([]); warnings.push(warningText("Destek geçmişi")); }
    if (securityResult.status === "fulfilled") setSecurityStatus(securityResult.value); else { setSecurityStatus(null); warnings.push(warningText("Güvenlik durumu")); }
    if (couponResult.status === "fulfilled") setCoupons(couponResult.value); else { setCoupons([]); warnings.push(warningText("Kuponlar")); }
    if (questionResult.status === "fulfilled") setQuestions(questionResult.value); else { setQuestions([]); warnings.push(warningText("Sorular")); }
    if (reviewResult.status === "fulfilled") setReviews(reviewResult.value); else { setReviews([]); warnings.push(warningText("Değerlendirmeler")); }
    if (followedStoreResult.status === "fulfilled") setFollowedStores(followedStoreResult.value); else { setFollowedStores([]); warnings.push(warningText("Takip edilen mağazalar")); }
    setDataWarnings(Object.freeze(warnings));
  }, []);

  const establishVerifiedSession = useCallback(async () => {
    const currentSequence = ++sequence.current;
    const profile = await getCurrentCustomer();
    if (sequence.current !== currentSequence) return;
    markCustomerSessionVerified(profile);
    setUser(profile);
    setPhase("authenticated");
    setErrorMessage("");
    await loadPrivateData(profile, currentSequence);
  }, [loadPrivateData]);

  const refresh = useCallback(async () => {
    if (!hasCustomerSession()) {
      ++sequence.current;
      clearPrivateState();
      setPhase("guest");
      setErrorMessage("");
      return;
    }
    const guard = currentCustomerSessionGuard();
    setPhase("loading");
    setErrorMessage("");
    try {
      await establishVerifiedSession();
    } catch (error) {
      if (!customerSessionMatchesGuard(guard)) return;
      ++sequence.current;
      clearPrivateState();
      if (error instanceof CustomerNotificationApiError && [400, 401, 403].includes(error.status)) {
        await clearGuardedCustomerSession(guard);
        setPhase("guest");
        return;
      }
      setPhase(offline(error) ? "offline" : "error");
      setErrorMessage(offline(error)
        ? "Oturum sunucuda doğrulanamadı. Bağlantı geldiğinde tekrar deneyebilirsin."
        : "Müşteri hesabı doğrulanamadı. Tekrar deneyebilirsin.");
    }
  }, [clearPrivateState, establishVerifiedSession]);

  const login = useCallback(async (email: string, password: string) => {
    if (!notifications) throw new Error("Bildirim ve müşteri oturumu çalışma zamanı bulunamadı.");
    setBusy(true);
    let guard: ReturnType<typeof currentCustomerSessionGuard> | null = null;
    let loginStage: "login-request" | "me-verification" = "login-request";
    try {
      await notifications.login(email, password);
      guard = currentCustomerSessionGuard();
      loginStage = "me-verification";
      await establishVerifiedSession();
    } catch (error) {
      const surfacedError = loginStage === "me-verification"
        ? new CustomerNotificationApiError(
          "Giriş tamamlandı ancak müşteri hesabı doğrulanamadı.",
          error instanceof CustomerNotificationApiError ? error.status : 0,
          "CUSTOMER_LOGIN_ME_FAILED",
        )
        : error;
      if (guard) {
        if (!customerSessionMatchesGuard(guard)) throw surfacedError;
        await clearGuardedCustomerSession(guard);
      } else if (hasCustomerSession()) {
        throw surfacedError;
      }
      ++sequence.current;
      clearPrivateState();
      setPhase("guest");
      throw surfacedError;
    } finally {
      setBusy(false);
    }
  }, [clearPrivateState, establishVerifiedSession, notifications]);

  const register = useCallback(async (fullName: string, email: string, password: string) => {
    setBusy(true);
    let guard: ReturnType<typeof currentCustomerSessionGuard> | null = null;
    try {
      await registerCustomer(fullName, email, password);
      if (!notifications) throw new Error("Müşteri oturumu çalışma zamanı bulunamadı.");
      await notifications.login(email, password);
      guard = currentCustomerSessionGuard();
      await establishVerifiedSession();
    } catch (error) {
      if (guard) {
        if (!customerSessionMatchesGuard(guard)) throw error;
        await clearGuardedCustomerSession(guard);
      } else if (hasCustomerSession()) {
        throw error;
      }
      ++sequence.current;
      clearPrivateState();
      setPhase("guest");
      throw error;
    } finally {
      setBusy(false);
    }
  }, [clearPrivateState, establishVerifiedSession, notifications]);

  const recover = useCallback(async (email: string) => {
    setBusy(true);
    try { await requestPasswordRecovery(email); } finally { setBusy(false); }
  }, []);

  const logout = useCallback(async () => {
    if (!notifications) throw new Error("Müşteri oturumu çalışma zamanı bulunamadı.");
    setBusy(true);
    try {
      await notifications.logout();
      ++sequence.current;
      clearPrivateState();
      setPhase("guest");
      setErrorMessage("");
    } finally {
      setBusy(false);
    }
  }, [clearPrivateState, notifications]);

  const updateProfile = useCallback(async (fullName: string, phone: string) => {
    setBusy(true);
    try {
      await updateCustomerProfile(fullName, phone);
      await establishVerifiedSession();
    } finally { setBusy(false); }
  }, [establishVerifiedSession]);

  const refreshAddresses = useCallback(async () => setAddresses(await listCustomerAddresses()), []);
  const createAddress = useCallback(async (value: CustomerAddressInput) => {
    setBusy(true); try { await createCustomerAddress(value); await refreshAddresses(); } finally { setBusy(false); }
  }, [refreshAddresses]);
  const updateAddress = useCallback(async (id: number, value: CustomerAddressInput) => {
    setBusy(true); try { await updateCustomerAddress(id, value); await refreshAddresses(); } finally { setBusy(false); }
  }, [refreshAddresses]);
  const deleteAddress = useCallback(async (id: number) => {
    setBusy(true); try { await deleteCustomerAddress(id); await refreshAddresses(); } finally { setBusy(false); }
  }, [refreshAddresses]);
  const setDefaultAddress = useCallback(async (id: number) => {
    setBusy(true); try { await makeDefaultCustomerAddress(id); await refreshAddresses(); } finally { setBusy(false); }
  }, [refreshAddresses]);

  const refreshOrdersAndReturns = useCallback(async () => {
    if (!user) return;
    const currentSequence = sequence.current;
    const customerId = user.id;
    const [nextOrders, nextReturns] = await Promise.all([listCustomerOrders(customerId), listCustomerReturns()]);
    if (sequence.current !== currentSequence) return;
    setOrders(nextOrders);
    setReturns(nextReturns);
  }, [user]);
  const cancelOrder = useCallback(async (id: number, expectedStatus: string) => {
    const currentSequence = sequence.current;
    setBusy(true);
    try {
      await cancelCustomerOrder(id, expectedStatus);
      if (sequence.current !== currentSequence) return;
      await refreshOrdersAndReturns();
    } catch (error) {
      if (sequence.current === currentSequence && error instanceof CustomerNotificationApiError && error.status === 409) {
        try { await refreshOrdersAndReturns(); } catch { /* preserve the original lifecycle error */ }
      }
      throw error;
    } finally { setBusy(false); }
  }, [refreshOrdersAndReturns]);
  const createReturn = useCallback(async (orderId: number, reasonCode: string, note = "") => {
    const currentSequence = sequence.current;
    setBusy(true);
    try {
      await createCustomerReturn(orderId, reasonCode, note);
      if (sequence.current !== currentSequence) return;
      await refreshOrdersAndReturns();
    } finally { setBusy(false); }
  }, [refreshOrdersAndReturns]);

  const refreshFollowedStores = useCallback(async () => {
    if (!user) return;
    const currentSequence = sequence.current;
    const currentLoadSequence = ++followedStoresLoadSequence.current;
    const nextStores = await listCustomerFollowedStores();
    if (sequence.current !== currentSequence || followedStoresLoadSequence.current !== currentLoadSequence) return;
    setFollowedStores(nextStores);
    const followedStoresWarning = warningText("Takip edilen mağazalar");
    setDataWarnings((current) => Object.freeze(current.filter((warning) => warning !== followedStoresWarning)));
  }, [user]);

  const unfollowStore = useCallback(async (storeSlug: string) => {
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    const guard = currentCustomerSessionGuard();
    const currentOperation = ++unfollowOperationSequence.current;
    setBusy(true);
    try {
      await unfollowCustomerStore(storeSlug);
      if (!customerSessionMatchesGuard(guard)) return;
      await refreshFollowedStores();
    } finally {
      if (customerSessionMatchesGuard(guard) && unfollowOperationSequence.current === currentOperation) setBusy(false);
    }
  }, [refreshFollowedStores, user]);

  const refreshSupport = useCallback(async () => {
    if (!user) return;
    setSupportMessages(await listCustomerSupportMessages(user.id));
  }, [user]);
  const sendSupport = useCallback(async (message: string) => {
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    setBusy(true);
    try { await sendCustomerSupportMessage(user.id, message); await refreshSupport(); } finally { setBusy(false); }
  }, [refreshSupport, user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const onOnline = () => { if (hasCustomerSession()) void refresh(); };
    const onSessionReady = () => { void refresh(); };
    const onAuthRequired = () => { ++sequence.current; clearPrivateState(); setPhase("guest"); };
    const onAuthUnverified = () => {
      ++sequence.current;
      clearPrivateState();
      setPhase(globalThis.navigator?.onLine ? "error" : "offline");
      setErrorMessage("Müşteri oturumu yeniden doğrulanana kadar özel hesap bilgileri gizlendi.");
    };
    globalThis.addEventListener("online", onOnline);
    globalThis.addEventListener("novastore:session-ready", onSessionReady);
    globalThis.addEventListener("novastore:auth-required", onAuthRequired);
    globalThis.addEventListener("novastore:auth-unverified", onAuthUnverified);
    if (document.documentElement.dataset.novastoreSessionStorage === "ready-after-timeout") onSessionReady();
    return () => {
      globalThis.removeEventListener("online", onOnline);
      globalThis.removeEventListener("novastore:session-ready", onSessionReady);
      globalThis.removeEventListener("novastore:auth-required", onAuthRequired);
      globalThis.removeEventListener("novastore:auth-unverified", onAuthUnverified);
    };
  }, [clearPrivateState, refresh]);

  const value = useMemo<CustomerAccountRuntimeValue>(() => Object.freeze({
    phase, user, addresses, coupons, questions, reviews, followedStores, orders, returns, supportMessages, securityStatus, errorMessage, dataWarnings, busy,
    refresh, login, register, requestPasswordRecovery: recover, logout, updateProfile,
    createAddress, updateAddress, deleteAddress, setDefaultAddress, cancelOrder, createReturn, refreshSupport,
    refreshFollowedStores, unfollowStore,
    sendSupportMessage: sendSupport,
  }), [phase, user, addresses, coupons, questions, reviews, followedStores, orders, returns, supportMessages, securityStatus, errorMessage, dataWarnings, busy, refresh, login, register, recover, logout, updateProfile, createAddress, updateAddress, deleteAddress, setDefaultAddress, cancelOrder, createReturn, refreshFollowedStores, unfollowStore, refreshSupport, sendSupport]);

  return <CustomerAccountRuntimeContext.Provider value={value}>{children}</CustomerAccountRuntimeContext.Provider>;
}
