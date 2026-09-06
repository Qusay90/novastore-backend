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
  changeCustomerPassword,
  deleteCustomerAddress,
  getCurrentCustomer,
  getCustomerReturn,
  getCustomerSecurityStatus,
  listCustomerAddresses,
  listCustomerCoupons,
  listCustomerFollowedStores,
  listCustomerFavoriteProductIds,
  listCustomerOrders,
  listCustomerQuestions,
  listCustomerReviews,
  listCustomerReturns,
  listCustomerSupportMessages,
  makeDefaultCustomerAddress,
  addCustomerFavorite,
  removeCustomerFavorite,
  registerCustomer,
  requestPasswordRecovery,
  sendCustomerSupportMessage,
  submitCustomerProductQuestion,
  submitCustomerProductReview,
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
export type CustomerReturnResourcePhase = "loading" | "ready" | "empty" | "error" | "offline" | "session-expired";

type CustomerAccountRuntimeValue = Readonly<{
  phase: CustomerAccountPhase;
  user: CustomerProfile | null;
  addresses: readonly CustomerAddress[];
  coupons: readonly CustomerCoupon[];
  questions: readonly CustomerQuestion[];
  reviews: readonly CustomerReview[];
  followedStores: readonly CustomerFollowedStore[];
  favoriteProductIds: readonly number[];
  orders: readonly CustomerOrder[];
  returns: readonly CustomerReturn[];
  returnHistoryPhase: CustomerReturnResourcePhase;
  returnHistoryError: string;
  returnDetail: CustomerReturn | null;
  returnDetailId: number | null;
  returnDetailPhase: CustomerReturnResourcePhase;
  returnDetailError: string;
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
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  createAddress(value: CustomerAddressInput): Promise<void>;
  updateAddress(id: number, value: CustomerAddressInput): Promise<void>;
  deleteAddress(id: number): Promise<void>;
  setDefaultAddress(id: number): Promise<void>;
  cancelOrder(id: number, expectedStatus: string): Promise<void>;
  refreshReturns(): Promise<void>;
  loadReturnDetail(returnId: number): Promise<CustomerReturn | null>;
  clearReturnDetail(): void;
  createReturn(orderId: number, reasonCode: string, note?: string): Promise<CustomerReturn>;
  refreshFollowedStores(): Promise<void>;
  unfollowStore(storeSlug: string): Promise<void>;
  refreshFavoriteProductIds(): Promise<void>;
  setFavoriteProduct(productId: number, favorited: boolean): Promise<void>;
  submitProductQuestion(productId: number, question: string): Promise<void>;
  submitProductReview(productId: number, rating: number, comment: string): Promise<void>;
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

function returnResourcePhase(error: unknown): CustomerReturnResourcePhase {
  if (offline(error)) return "offline";
  if (error instanceof CustomerNotificationApiError && error.status === 401) return "session-expired";
  return "error";
}

function returnResourceMessage(scope: "history" | "detail", error: unknown) {
  const phase = returnResourcePhase(error);
  if (phase === "offline") return scope === "history"
    ? "İade taleplerin çevrimdışıyken doğrulanamadı. Bağlantı geldiğinde tekrar dene."
    : "Talep ayrıntısı çevrimdışıyken doğrulanamadı. Bağlantı geldiğinde tekrar dene.";
  if (phase === "session-expired") return "Oturumun sona erdi. İade bilgilerini görmek için yeniden giriş yap.";
  return scope === "history"
    ? "İade taleplerin sunucudan alınamadı. Bu durum boş geçmiş olarak kabul edilmedi."
    : "Bu iade talebi bulunamadı veya artık bu hesap tarafından erişilemiyor.";
}

function upsertCustomerReturn(current: readonly CustomerReturn[], incoming: CustomerReturn) {
  return Object.freeze([incoming, ...current.filter((item) => item.id !== incoming.id)]);
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
  const [favoriteProductIds, setFavoriteProductIds] = useState<readonly number[]>([]);
  const [orders, setOrders] = useState<readonly CustomerOrder[]>([]);
  const [returns, setReturns] = useState<readonly CustomerReturn[]>([]);
  const [returnHistoryPhase, setReturnHistoryPhase] = useState<CustomerReturnResourcePhase>("loading");
  const [returnHistoryError, setReturnHistoryError] = useState("");
  const [returnDetail, setReturnDetail] = useState<CustomerReturn | null>(null);
  const [returnDetailId, setReturnDetailId] = useState<number | null>(null);
  const [returnDetailPhase, setReturnDetailPhase] = useState<CustomerReturnResourcePhase>("loading");
  const [returnDetailError, setReturnDetailError] = useState("");
  const [supportMessages, setSupportMessages] = useState<readonly CustomerSupportMessage[]>([]);
  const [securityStatus, setSecurityStatus] = useState<CustomerSecurityStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [dataWarnings, setDataWarnings] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const followedStoresLoadSequence = useRef(0);
  const unfollowOperationSequence = useRef(0);
  const favoriteLoadSequence = useRef(0);
  const favoriteMutationSequence = useRef(0);
  const communityMutationSequence = useRef(0);
  const returnHistoryLoadSequence = useRef(0);
  const returnDetailLoadSequence = useRef(0);
  const returnCreateSequence = useRef(0);
  const confirmedCreatedReturns = useRef(new Map<number, CustomerReturn>());

  const mergeConfirmedCreatedReturns = useCallback((serverReturns: readonly CustomerReturn[]) => {
    if (!confirmedCreatedReturns.current.size) return serverReturns;
    const merged = [...serverReturns];
    const serverIds = new Set(serverReturns.map((item) => item.id));
    for (const [id, item] of confirmedCreatedReturns.current) {
      if (serverIds.has(id)) confirmedCreatedReturns.current.delete(id);
      else merged.unshift(item);
    }
    return Object.freeze(merged);
  }, []);

  const clearPrivateState = useCallback(() => {
    setUser(null);
    setAddresses([]);
    setCoupons([]);
    setQuestions([]);
    setReviews([]);
    setFollowedStores([]);
    setFavoriteProductIds([]);
    setOrders([]);
    setReturns([]);
    setReturnHistoryPhase("session-expired");
    setReturnHistoryError("Oturumun sona erdi. İade bilgilerini görmek için yeniden giriş yap.");
    setReturnDetail(null);
    setReturnDetailId(null);
    setReturnDetailPhase("session-expired");
    setReturnDetailError("Oturumun sona erdi. İade bilgilerini görmek için yeniden giriş yap.");
    setSupportMessages([]);
    setSecurityStatus(null);
    setDataWarnings([]);
    setBusy(false);
    ++followedStoresLoadSequence.current;
    ++unfollowOperationSequence.current;
    ++favoriteLoadSequence.current;
    ++favoriteMutationSequence.current;
    ++communityMutationSequence.current;
    ++returnHistoryLoadSequence.current;
    ++returnDetailLoadSequence.current;
    ++returnCreateSequence.current;
    confirmedCreatedReturns.current.clear();
  }, []);

  const loadPrivateData = useCallback(async (profile: CustomerProfile, currentSequence: number) => {
    const currentReturnLoad = ++returnHistoryLoadSequence.current;
    setReturnHistoryPhase("loading");
    setReturnHistoryError("");
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
      listCustomerFavoriteProductIds(),
    ] as const);
    if (sequence.current !== currentSequence) return;
    const warnings: string[] = [];
    const [addressResult, orderResult, returnResult, supportResult, securityResult, couponResult, questionResult, reviewResult, followedStoreResult, favoriteResult] = results;
    if (addressResult.status === "fulfilled") setAddresses(addressResult.value); else { setAddresses([]); warnings.push(warningText("Adresler")); }
    if (orderResult.status === "fulfilled") setOrders(orderResult.value); else { setOrders([]); warnings.push(warningText("Siparişler")); }
    if (returnHistoryLoadSequence.current === currentReturnLoad) {
      if (returnResult.status === "fulfilled") {
        const nextReturns = mergeConfirmedCreatedReturns(returnResult.value);
        setReturns(nextReturns);
        setReturnHistoryPhase(nextReturns.length ? "ready" : "empty");
        setReturnHistoryError("");
      } else {
        setReturns([]);
        setReturnHistoryPhase(returnResourcePhase(returnResult.reason));
        setReturnHistoryError(returnResourceMessage("history", returnResult.reason));
        warnings.push(warningText("İadeler"));
      }
    }
    if (supportResult.status === "fulfilled") setSupportMessages(supportResult.value); else { setSupportMessages([]); warnings.push(warningText("Destek geçmişi")); }
    if (securityResult.status === "fulfilled") setSecurityStatus(securityResult.value); else { setSecurityStatus(null); warnings.push(warningText("Güvenlik durumu")); }
    if (couponResult.status === "fulfilled") setCoupons(couponResult.value); else { setCoupons([]); warnings.push(warningText("Kuponlar")); }
    if (questionResult.status === "fulfilled") setQuestions(questionResult.value); else { setQuestions([]); warnings.push(warningText("Sorular")); }
    if (reviewResult.status === "fulfilled") setReviews(reviewResult.value); else { setReviews([]); warnings.push(warningText("Değerlendirmeler")); }
    if (followedStoreResult.status === "fulfilled") setFollowedStores(followedStoreResult.value); else { setFollowedStores([]); warnings.push(warningText("Takip edilen mağazalar")); }
    if (favoriteResult.status === "fulfilled") setFavoriteProductIds(favoriteResult.value); else { setFavoriteProductIds([]); warnings.push(warningText("Favoriler")); }
    setDataWarnings(Object.freeze(warnings));
  }, [mergeConfirmedCreatedReturns]);

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

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    const guard = currentCustomerSessionGuard();
    setBusy(true);
    try {
      await changeCustomerPassword(currentPassword, newPassword);
      if (!customerSessionMatchesGuard(guard)) return;
    } finally {
      if (customerSessionMatchesGuard(guard)) setBusy(false);
    }
  }, [user]);

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

  const refreshReturns = useCallback(async () => {
    if (!user) {
      setReturns([]);
      setReturnHistoryPhase("session-expired");
      setReturnHistoryError("Oturumun sona erdi. İade bilgilerini görmek için yeniden giriş yap.");
      return;
    }
    const guard = currentCustomerSessionGuard();
    const currentLoad = ++returnHistoryLoadSequence.current;
    setReturnHistoryPhase("loading");
    setReturnHistoryError("");
    try {
      const nextReturns = await listCustomerReturns();
      if (!customerSessionMatchesGuard(guard) || returnHistoryLoadSequence.current !== currentLoad) return;
      const mergedReturns = mergeConfirmedCreatedReturns(nextReturns);
      setReturns(mergedReturns);
      setReturnHistoryPhase(mergedReturns.length ? "ready" : "empty");
      setDataWarnings((current) => Object.freeze(current.filter((warning) => warning !== warningText("İadeler"))));
    } catch (error) {
      if (!customerSessionMatchesGuard(guard) || returnHistoryLoadSequence.current !== currentLoad) return;
      const nextPhase = returnResourcePhase(error);
      if (nextPhase === "session-expired") setReturns([]);
      setReturnHistoryPhase(nextPhase);
      setReturnHistoryError(returnResourceMessage("history", error));
      setDataWarnings((current) => current.includes(warningText("İadeler"))
        ? current
        : Object.freeze([...current, warningText("İadeler")]));
      throw error;
    }
  }, [mergeConfirmedCreatedReturns, user]);

  const clearReturnDetail = useCallback(() => {
    ++returnDetailLoadSequence.current;
    setReturnDetail(null);
    setReturnDetailId(null);
    setReturnDetailPhase(user ? "loading" : "session-expired");
    setReturnDetailError("");
  }, [user]);

  const loadReturnDetail = useCallback(async (returnId: number) => {
    if (!user) {
      setReturnDetail(null);
      setReturnDetailId(null);
      setReturnDetailPhase("session-expired");
      setReturnDetailError("Oturumun sona erdi. İade bilgilerini görmek için yeniden giriş yap.");
      return null;
    }
    const guard = currentCustomerSessionGuard();
    const currentLoad = ++returnDetailLoadSequence.current;
    setReturnDetail(null);
    setReturnDetailId(returnId);
    setReturnDetailPhase("loading");
    setReturnDetailError("");
    try {
      const detail = await getCustomerReturn(returnId);
      if (!customerSessionMatchesGuard(guard) || returnDetailLoadSequence.current !== currentLoad) return null;
      setReturnDetail(detail);
      setReturnDetailId(detail.id);
      setReturnDetailPhase("ready");
      setReturns((current) => upsertCustomerReturn(current, detail));
      return detail;
    } catch (error) {
      if (!customerSessionMatchesGuard(guard) || returnDetailLoadSequence.current !== currentLoad) return null;
      setReturnDetail(null);
      setReturnDetailId(returnId);
      setReturnDetailPhase(returnResourcePhase(error));
      setReturnDetailError(returnResourceMessage("detail", error));
      throw error;
    }
  }, [user]);

  const refreshOrdersAndReturns = useCallback(async () => {
    if (!user) return;
    const currentSequence = sequence.current;
    const currentReturnLoad = ++returnHistoryLoadSequence.current;
    const customerId = user.id;
    const [nextOrders, nextReturns] = await Promise.all([listCustomerOrders(customerId), listCustomerReturns()]);
    if (sequence.current !== currentSequence) return;
    setOrders(nextOrders);
    if (returnHistoryLoadSequence.current === currentReturnLoad) {
      const mergedReturns = mergeConfirmedCreatedReturns(nextReturns);
      setReturns(mergedReturns);
      setReturnHistoryPhase(mergedReturns.length ? "ready" : "empty");
      setReturnHistoryError("");
    }
  }, [mergeConfirmedCreatedReturns, user]);
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
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    const guard = currentCustomerSessionGuard();
    const currentOperation = ++returnCreateSequence.current;
    setBusy(true);
    try {
      const created = await createCustomerReturn(orderId, reasonCode, note);
      if (!customerSessionMatchesGuard(guard) || returnCreateSequence.current !== currentOperation) {
        throw new CustomerNotificationApiError("Müşteri oturumu değişti. Güncel hesaptaki iadeleri yeniden aç.", 409, "CUSTOMER_SESSION_CHANGED");
      }
      const currentReturnLoad = ++returnHistoryLoadSequence.current;
      confirmedCreatedReturns.current.set(created.return.id, created.return);
      setReturns((current) => upsertCustomerReturn(current, created.return));
      setReturnHistoryPhase("ready");
      setReturnHistoryError("");

      void (async () => {
        const [orderResult, returnResult] = await Promise.allSettled([
          listCustomerOrders(user.id),
          listCustomerReturns(),
        ] as const);
        if (
          !customerSessionMatchesGuard(guard) ||
          returnCreateSequence.current !== currentOperation ||
          returnHistoryLoadSequence.current !== currentReturnLoad
        ) return;
        if (orderResult.status === "fulfilled") setOrders(orderResult.value);
        if (returnResult.status === "fulfilled") {
          const mergedReturns = mergeConfirmedCreatedReturns(returnResult.value);
          setReturns(mergedReturns);
          setReturnHistoryPhase(mergedReturns.length ? "ready" : "empty");
          setReturnHistoryError("");
          setDataWarnings((current) => Object.freeze(current.filter((warning) => warning !== warningText("İadeler"))));
        } else {
          setReturnHistoryPhase(returnResourcePhase(returnResult.reason));
          setReturnHistoryError("Talebiniz oluşturuldu; geçmiş yenilenemedi. Güvenle tekrar deneyebilirsin.");
          setDataWarnings((current) => current.includes(warningText("İadeler"))
            ? current
            : Object.freeze([...current, warningText("İadeler")]));
        }
        if (orderResult.status === "rejected") {
          setDataWarnings((current) => current.includes(warningText("Siparişler"))
            ? current
            : Object.freeze([...current, warningText("Siparişler")]));
        }
      })();
      return created.return;
    } finally {
      if (customerSessionMatchesGuard(guard) && returnCreateSequence.current === currentOperation) setBusy(false);
    }
  }, [mergeConfirmedCreatedReturns, user]);

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

  const refreshFavoriteProductIds = useCallback(async () => {
    if (!user) return;
    const currentSequence = sequence.current;
    const currentLoadSequence = ++favoriteLoadSequence.current;
    const ids = await listCustomerFavoriteProductIds();
    if (sequence.current !== currentSequence || favoriteLoadSequence.current !== currentLoadSequence) return;
    setFavoriteProductIds(ids);
    const favoriteWarning = warningText("Favoriler");
    setDataWarnings((current) => Object.freeze(current.filter((warning) => warning !== favoriteWarning)));
  }, [user]);

  const setFavoriteProduct = useCallback(async (productId: number, favorited: boolean) => {
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    const guard = currentCustomerSessionGuard();
    const currentOperation = ++favoriteMutationSequence.current;
    setBusy(true);
    try {
      const confirmed = favorited
        ? await addCustomerFavorite(productId)
        : await removeCustomerFavorite(productId);
      if (!customerSessionMatchesGuard(guard) || favoriteMutationSequence.current !== currentOperation) return;
      setFavoriteProductIds((current) => Object.freeze(confirmed.favorited
        ? current.includes(confirmed.productId) ? [...current] : [...current, confirmed.productId]
        : current.filter((id) => id !== confirmed.productId)));
    } finally {
      if (customerSessionMatchesGuard(guard) && favoriteMutationSequence.current === currentOperation) setBusy(false);
    }
  }, [user]);

  const submitProductQuestion = useCallback(async (productId: number, question: string) => {
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    const guard = currentCustomerSessionGuard();
    const currentOperation = ++communityMutationSequence.current;
    setBusy(true);
    try {
      await submitCustomerProductQuestion(productId, question);
      if (!customerSessionMatchesGuard(guard) || communityMutationSequence.current !== currentOperation) return;
      const nextQuestions = await listCustomerQuestions();
      if (customerSessionMatchesGuard(guard) && communityMutationSequence.current === currentOperation) setQuestions(nextQuestions);
    } finally {
      if (customerSessionMatchesGuard(guard) && communityMutationSequence.current === currentOperation) setBusy(false);
    }
  }, [user]);

  const submitProductReview = useCallback(async (productId: number, rating: number, comment: string) => {
    if (!user) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
    const guard = currentCustomerSessionGuard();
    const currentOperation = ++communityMutationSequence.current;
    setBusy(true);
    try {
      await submitCustomerProductReview(productId, rating, comment);
      if (!customerSessionMatchesGuard(guard) || communityMutationSequence.current !== currentOperation) return;
      const nextReviews = await listCustomerReviews(user.id);
      if (customerSessionMatchesGuard(guard) && communityMutationSequence.current === currentOperation) setReviews(nextReviews);
    } finally {
      if (customerSessionMatchesGuard(guard) && communityMutationSequence.current === currentOperation) setBusy(false);
    }
  }, [user]);

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
    phase, user, addresses, coupons, questions, reviews, followedStores, favoriteProductIds, orders, returns,
    returnHistoryPhase, returnHistoryError, returnDetail, returnDetailId, returnDetailPhase, returnDetailError,
    supportMessages, securityStatus, errorMessage, dataWarnings, busy,
    refresh, login, register, requestPasswordRecovery: recover, logout, updateProfile, changePassword,
    createAddress, updateAddress, deleteAddress, setDefaultAddress, cancelOrder,
    refreshReturns, loadReturnDetail, clearReturnDetail, createReturn, refreshSupport,
    refreshFollowedStores, unfollowStore, refreshFavoriteProductIds, setFavoriteProduct, submitProductQuestion, submitProductReview,
    sendSupportMessage: sendSupport,
  }), [phase, user, addresses, coupons, questions, reviews, followedStores, favoriteProductIds, orders, returns,
    returnHistoryPhase, returnHistoryError, returnDetail, returnDetailId, returnDetailPhase, returnDetailError,
    supportMessages, securityStatus, errorMessage, dataWarnings, busy, refresh, login, register, recover, logout,
    updateProfile, changePassword, createAddress, updateAddress, deleteAddress, setDefaultAddress, cancelOrder,
    refreshReturns, loadReturnDetail, clearReturnDetail, createReturn, refreshFollowedStores, unfollowStore,
    refreshFavoriteProductIds, setFavoriteProduct, submitProductQuestion, submitProductReview, refreshSupport, sendSupport]);

  return <CustomerAccountRuntimeContext.Provider value={value}>{children}</CustomerAccountRuntimeContext.Provider>;
}
