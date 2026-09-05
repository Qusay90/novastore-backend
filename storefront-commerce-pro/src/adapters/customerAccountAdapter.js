import { RETURN_STATUS_LABELS, normalizeCustomerReturn } from "./customerReturnContract.js";
import { resolveNotificationTarget } from "../../../web-notifications/notificationClient.js";

const TOKEN_KEY = "nova_user_token";
const USER_KEY = "nova_user_info";
const LEGACY_ADDRESS_LIST_KEY = "novastore_user_addresses";
const LEGACY_SINGLE_ADDRESS_KEY = "nova_user_address";

const asTrimmedString = (value) => String(value ?? "").trim();

const safeMediaUrl = (value) => {
  const normalized = asTrimmedString(value);
  if (!normalized) return "";
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
};

const toPositiveInteger = (value) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
};

export const resolveCustomerNotificationTarget = (value) => resolveNotificationTarget(value, "customer");

export const normalizeCustomerUser = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  if (!id) return null;
  return Object.freeze({
    id,
    fullName: asTrimmedString(value.fullName || value.full_name || value.name),
    email: asTrimmedString(value.email),
    phone: asTrimmedString(value.phone) || null,
    role: asTrimmedString(value.role || "customer") || "customer",
  });
};

export const normalizeCustomerAddress = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  if (!id) return null;
  const addressLine = asTrimmedString(
    value.addressLine || value.address_line || value.detail || value.fullAddress || value.address,
  );
  const city = asTrimmedString(value.city || value.province);
  const district = asTrimmedString(value.district);
  return Object.freeze({
    id,
    title: asTrimmedString(value.title || value.label) || "Adres",
    fullName: asTrimmedString(value.fullName || value.full_name || value.recipientName),
    phone: asTrimmedString(value.phone),
    city,
    district,
    addressLine,
    isDefault: value.isDefault === true || value.is_default === true,
    singleLine: asTrimmedString(value.singleLine) || [addressLine, district, city].filter(Boolean).join(", "),
  });
};

const parseArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const normalizeOrderItem = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id ?? value.productId ?? value.product_id);
  const quantity = Math.max(1, Number.parseInt(value.quantity || 1, 10) || 1);
  const price = Number(value.price || 0);
  const name = asTrimmedString(value.name);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  return Object.freeze({
    id,
    name,
    quantity,
    price,
    image: safeMediaUrl(value.image || value.imageUrl || value.image_url),
  });
};

const ORDER_TONES = Object.freeze({
  "Teslim Edildi": "success",
  "Kargoya Verildi": "info",
  Hazırlanıyor: "warning",
  "Onay Bekliyor": "warning",
  "Ödeme Bekliyor": "info",
  "Ödeme Başarısız": "danger",
  "İptal Edildi": "danger",
  "İade Edildi": "info",
});

const CANCELLABLE_STATUSES = new Set([
  "Ödeme Bekliyor",
  "Onay Bekliyor",
  "Hazırlanıyor",
]);


export const normalizeCustomerOrder = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  if (!id) return null;
  const status = asTrimmedString(value.display_status || value.status) || "Durum bilgisi bekleniyor";
  const total = Number(value.total_amount ?? value.total ?? 0);
  const items = parseArray(value.items).map(normalizeOrderItem).filter(Boolean);
  const paymentStatus = asTrimmedString(value.payment_status || value.paymentStatus) || null;
  const returnId = toPositiveInteger(value.return_id || value.returnId);
  const returnStatus = asTrimmedString(value.return_status || value.returnStatus).toUpperCase() || null;
  return Object.freeze({
    id,
    status,
    tone: ORDER_TONES[status] || "info",
    statusNote: asTrimmedString(value.status_note) || null,
    createdAt: value.created_at || value.createdAt || null,
    total: Number.isFinite(total) && total >= 0 ? total : 0,
    items: Object.freeze(items),
    address: asTrimmedString(
      value.address || value.shipping_address || value.delivery_address || value.customer_address,
    ) || null,
    paymentMethod: asTrimmedString(value.payment_method || value.paymentMethod) || null,
    paymentStatus,
    currency: /^[A-Z]{3}$/.test(value.currency || "") ? value.currency : null,
    refundStatus: asTrimmedString(value.refund_status || value.refundStatus) || null,
    trackingNo: asTrimmedString(value.tracking_no || value.trackingNo) || null,
    trackingUrl: asTrimmedString(value.tracking_url || value.trackingUrl) || null,
    etaDate: value.eta_date || value.estimated_delivery_date || value.etaDate || null,
    cancellable: CANCELLABLE_STATUSES.has(status) && value.is_payment_failed !== true,
    returnId,
    returnStatus,
    returnStatusLabel: returnStatus ? (RETURN_STATUS_LABELS[returnStatus] || returnStatus) : null,
    returnDecisionNote: asTrimmedString(value.return_decision_note || value.returnDecisionNote) || null,
    returnable: status === "Teslim Edildi" && paymentStatus === "PAID" && (!returnId || ["REJECTED", "COMPLETED"].includes(returnStatus)),
  });
};

export const normalizeCustomerCoupon = (value) => {
  if (!value || typeof value !== "object") return null;
  const code = asTrimmedString(value.code).toLocaleUpperCase("tr-TR");
  if (!code) return null;
  const type = asTrimmedString(value.discount_type).toUpperCase();
  return Object.freeze({
    id: toPositiveInteger(value.id),
    code,
    type,
    value: Number(value.discount_value || 0),
    minOrderAmount: Number(value.min_order_amount || 0),
    maxDiscountAmount: value.max_discount_amount == null ? null : Number(value.max_discount_amount),
    startsAt: value.starts_at || null,
    endsAt: value.ends_at || null,
  });
};

export const normalizeCustomerNotification = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  const message = asTrimmedString(value.message);
  if (!id || !message) return null;
  return Object.freeze({
    id,
    type: asTrimmedString(value.type) || "notification",
    title: asTrimmedString(value.title) || "NovaStore bildirimi",
    message,
    category: asTrimmedString(value.category) || "ACCOUNT",
    priority: asTrimmedString(value.priority) || "NORMAL",
    isRead: value.is_read === true || value.isRead === true,
    readAt: value.read_at || value.readAt || null,
    createdAt: value.created_at || value.createdAt || null,
    target: resolveCustomerNotificationTarget(value),
  });
};

export const normalizeCustomerMessage = (value, customerId) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  const message = asTrimmedString(value.message);
  if (!id || !message) return null;
  return Object.freeze({
    id,
    message,
    sentByCustomer: Number(value.sender_id) === Number(customerId),
    isSystem: value.is_ai_handoff === true || message.startsWith("[AI DESTEK DEVRI]"),
    createdAt: value.created_at || value.createdAt || null,
  });
};

const normalizeStoreSlug = (value) => {
  const slug = asTrimmedString(value).toLocaleLowerCase("en-US");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 160 ? slug : null;
};

export const normalizeCustomerQuestion = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  const productId = toPositiveInteger(value.product_id || value.productId);
  const question = asTrimmedString(value.question);
  const productName = asTrimmedString(value.product_name || value.productName);
  if (!id || !productId || !question || !productName) return null;
  const answer = asTrimmedString(value.answer) || null;
  return Object.freeze({
    id,
    productId,
    productName,
    productImage: safeMediaUrl(value.product_image || value.productImage || value.image_url),
    question,
    answer,
    status: answer ? "answered" : "pending",
    createdAt: value.created_at || value.createdAt || null,
    answeredAt: value.answered_at || value.answeredAt || null,
  });
};

const REVIEW_STATUSES = new Set(["PENDING", "PUBLISHED", "HIDDEN"]);

export const normalizeCustomerReview = (value) => {
  if (!value || typeof value !== "object") return null;
  const id = toPositiveInteger(value.id);
  const productId = toPositiveInteger(value.product_id || value.productId);
  const productName = asTrimmedString(value.product_name || value.productName);
  const rating = Number(value.rating);
  if (!id || !productId || !productName || !Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const rawStatus = asTrimmedString(value.status).toUpperCase();
  return Object.freeze({
    id,
    productId,
    productName,
    productImage: safeMediaUrl(value.image_url || value.product_image || value.productImage),
    rating,
    comment: asTrimmedString(value.comment),
    status: REVIEW_STATUSES.has(rawStatus) ? rawStatus : "PENDING",
    createdAt: value.created_at || value.createdAt || null,
  });
};

export const normalizeFollowedStore = (value) => {
  if (!value || typeof value !== "object") return null;
  const slug = normalizeStoreSlug(value.store_slug || value.storeSlug || value.slug);
  const name = asTrimmedString(value.store_name || value.storeName || value.name);
  if (!slug || !name || value.following !== true) return null;
  const followerCount = Number(value.follower_count ?? value.followerCount ?? 0);
  return Object.freeze({
    slug,
    name,
    following: true,
    followerCount: Number.isSafeInteger(followerCount) && followerCount >= 0 ? followerCount : 0,
    followedAt: value.followed_at || value.followedAt || null,
  });
};

const requireUserId = (session) => {
  const id = toPositiveInteger(session?.user?.id);
  if (!id) throw new Error("Doğrulanmış müşteri oturumu gereklidir.");
  return id;
};

const addressPayload = (value = {}) => ({
  title: asTrimmedString(value.title),
  fullName: asTrimmedString(value.fullName),
  phone: asTrimmedString(value.phone),
  city: asTrimmedString(value.city),
  district: asTrimmedString(value.district),
  addressLine: asTrimmedString(value.addressLine || value.detail),
  isDefault: value.isDefault === true,
});

const readStoredUserId = (storage) => {
  try {
    return toPositiveInteger(JSON.parse(storage?.getItem?.(USER_KEY) || "null")?.id);
  } catch {
    return null;
  }
};

const safeStoredJson = (storage, key, fallback) => {
  try {
    const value = storage?.getItem?.(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const normalizeLegacyAddressPayload = (value, user = {}) => {
  const payload = addressPayload({
    ...value,
    fullName: value?.fullName || value?.full_name || value?.recipientName || user?.fullName || user?.full_name,
    phone: value?.phone || user?.phone,
    addressLine: value?.addressLine || value?.address_line || value?.detail || value?.fullAddress || value?.address,
    isDefault: value?.isDefault === true || value?.is_default === true,
  });
  return ["title", "fullName", "phone", "city", "district", "addressLine"].every((field) => payload[field])
    ? payload
    : null;
};

const addressFingerprint = (value) => [
  value?.addressLine,
  value?.district,
  value?.city,
  String(value?.phone || "").replace(/\D/g, ""),
].map((part) => asTrimmedString(part).toLocaleLowerCase("tr-TR")).join("|");

const readLegacyAddressPayloads = (storage, userId) => {
  if (!userId) return Object.freeze([]);
  const storedUser = safeStoredJson(storage, USER_KEY, {});
  const scopedKey = `novastore_addresses_${userId}`;
  const scoped = safeStoredJson(storage, scopedKey, []);
  const shared = safeStoredJson(storage, LEGACY_ADDRESS_LIST_KEY, []);
  const single = safeStoredJson(storage, LEGACY_SINGLE_ADDRESS_KEY, null);
  const source = Array.isArray(scoped) && scoped.length
    ? scoped
    : Array.isArray(shared) && shared.length
      ? shared
      : single && typeof single === "object"
        ? [single]
        : [];
  return Object.freeze(source.map((value) => normalizeLegacyAddressPayload(value, storedUser)).filter(Boolean));
};

export function createCustomerAccountAdapter({
  http,
  storage = globalThis.localStorage,
  eventTarget = globalThis,
} = {}) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("Müşteri hesap adapterı HTTP istemcisi gerektirir.");
  }

  const saveSession = (payload) => {
    const token = asTrimmedString(payload?.token);
    const sessionId = asTrimmedString(payload?.sessionId) || null;
    const user = normalizeCustomerUser(payload?.user);
    if (!token || !user) throw new Error("Giriş yanıtında doğrulanmış müşteri oturumu bulunamadı.");
    storage?.setItem?.(TOKEN_KEY, token);
    storage?.setItem?.(USER_KEY, JSON.stringify(user));
    return Object.freeze({ status: "authenticated", sessionId, user, warning: null });
  };

  const login = async ({ email, password }, options = {}) => {
    const payload = await http.request("/api/users/login", {
      method: "POST",
      body: { email: asTrimmedString(email), password: String(password || "") },
      signal: options.signal,
    });
    return saveSession(payload);
  };

  const register = async ({ fullName, email, password }, options = {}) => http.request(
    "/api/users/register",
    {
      method: "POST",
      body: {
        fullName: asTrimmedString(fullName),
        email: asTrimmedString(email),
        password: String(password || ""),
      },
      signal: options.signal,
    },
  );

  const getProfile = async (options = {}) => {
    const payload = await http.request("/api/users/me", { signal: options.signal });
    const user = normalizeCustomerUser(payload?.user || payload);
    if (!user) throw new Error("Profil yanıtı doğrulanamadı.");
    storage?.setItem?.(USER_KEY, JSON.stringify(user));
    return user;
  };

  const forgotPassword = async (email, options = {}) => http.request("/api/auth/forgot-password", {
    method: "POST",
    body: { email: asTrimmedString(email) },
    signal: options.signal,
  });

  const resetPassword = async ({ token, password }, options = {}) => http.request("/api/auth/reset-password", {
    method: "POST",
    body: { token: asTrimmedString(token), newPassword: String(password || "") },
    signal: options.signal,
  });

  const updateProfile = async (value, options = {}) => {
    const payload = await http.request("/api/users/me", {
      method: "PATCH",
      body: {
        fullName: asTrimmedString(value.fullName),
        phone: asTrimmedString(value.phone) || null,
      },
      signal: options.signal,
    });
    const user = normalizeCustomerUser(payload?.user || payload);
    if (!user) throw new Error("Profil yanıtı doğrulanamadı.");
    storage?.setItem?.(USER_KEY, JSON.stringify(user));
    return user;
  };

  const changePassword = (value, options = {}) => http.request("/api/users/change-password", {
    method: "POST",
    body: {
      currentPassword: String(value.currentPassword || ""),
      newPassword: String(value.newPassword || ""),
    },
    signal: options.signal,
  });

  const logout = async (options = {}) => {
    let serverRevocationVerified = false;
    try {
      await http.request("/api/notifications/web-push/subscriptions/session", {
        method: "DELETE",
        signal: options.signal,
      }).catch(() => null);
      await http.request("/api/users/logout", { method: "POST", signal: options.signal });
      serverRevocationVerified = true;
    } catch (_error) {
      serverRevocationVerified = false;
    } finally {
      storage?.removeItem?.(TOKEN_KEY);
      storage?.removeItem?.(USER_KEY);
      if (typeof CustomEvent === "function") {
        eventTarget?.dispatchEvent?.(new CustomEvent("novastore:auth-required"));
      }
    }
    return Object.freeze({
      serverRevocationVerified,
      warning: serverRevocationVerified
        ? null
        : "Bu cihazdaki oturum kapatıldı; sunucu oturumunun kapatıldığı doğrulanamadı.",
    });
  };

  const listAddresses = async (options = {}) => {
    const payload = await http.request("/api/addresses", { signal: options.signal });
    let addresses = (Array.isArray(payload) ? payload : []).map(normalizeCustomerAddress).filter(Boolean);
    const userId = readStoredUserId(storage);
    const migrationKey = userId ? `novastore_addresses_migrated_${userId}` : null;
    if (!migrationKey || storage?.getItem?.(migrationKey) === "1") return Object.freeze(addresses);

    const legacyPayloads = readLegacyAddressPayloads(storage, userId);
    const fingerprints = new Set(addresses.map(addressFingerprint));
    for (const legacyPayload of legacyPayloads) {
      const fingerprint = addressFingerprint(legacyPayload);
      if (fingerprints.has(fingerprint)) continue;
      const created = normalizeCustomerAddress(await http.request("/api/addresses", {
        method: "POST",
        body: legacyPayload,
        signal: options.signal,
      }));
      if (!created) throw new Error("Yerel adres aktarım yanıtı doğrulanamadı.");
      addresses.push(created);
      fingerprints.add(fingerprint);
    }

    if (legacyPayloads.length) {
      const refreshed = await http.request("/api/addresses", { signal: options.signal });
      addresses = (Array.isArray(refreshed) ? refreshed : []).map(normalizeCustomerAddress).filter(Boolean);
      storage?.removeItem?.(`novastore_addresses_${userId}`);
      storage?.removeItem?.(LEGACY_ADDRESS_LIST_KEY);
      storage?.removeItem?.(LEGACY_SINGLE_ADDRESS_KEY);
    }
    storage?.setItem?.(migrationKey, "1");
    return Object.freeze(addresses);
  };

  const createAddress = async (value, options = {}) => normalizeCustomerAddress(await http.request(
    "/api/addresses",
    { method: "POST", body: addressPayload(value), signal: options.signal },
  ));

  const updateAddress = async (id, value, options = {}) => {
    const addressId = toPositiveInteger(id);
    if (!addressId) throw new Error("Geçersiz adres kimliği.");
    return normalizeCustomerAddress(await http.request(`/api/addresses/${addressId}`, {
      method: "PUT",
      body: addressPayload(value),
      signal: options.signal,
    }));
  };

  const deleteAddress = async (id, options = {}) => {
    const addressId = toPositiveInteger(id);
    if (!addressId) throw new Error("Geçersiz adres kimliği.");
    return http.request(`/api/addresses/${addressId}`, { method: "DELETE", signal: options.signal });
  };

  const setDefaultAddress = async (id, options = {}) => {
    const addressId = toPositiveInteger(id);
    if (!addressId) throw new Error("Geçersiz adres kimliği.");
    return normalizeCustomerAddress(await http.request(`/api/addresses/${addressId}/default`, {
      method: "PATCH",
      signal: options.signal,
    }));
  };

  const listOrders = async (session, options = {}) => {
    const userId = requireUserId(session);
    const payload = await http.request(`/api/orders/user/${userId}`, { signal: options.signal });
    return Object.freeze((Array.isArray(payload) ? payload : []).map(normalizeCustomerOrder).filter(Boolean));
  };

  const listQuestions = async (session, options = {}) => {
    requireUserId(session);
    const payload = await http.request("/api/questions/user", { signal: options.signal });
    return Object.freeze((Array.isArray(payload) ? payload : []).map(normalizeCustomerQuestion).filter(Boolean));
  };

  const listReviews = async (session, options = {}) => {
    const userId = requireUserId(session);
    const payload = await http.request(`/api/reviews/user/${userId}`, { signal: options.signal });
    return Object.freeze((Array.isArray(payload) ? payload : []).map(normalizeCustomerReview).filter(Boolean));
  };

  const listFollowedStores = async (session, options = {}) => {
    requireUserId(session);
    const payload = await http.request("/api/store-follows", { signal: options.signal });
    return Object.freeze((Array.isArray(payload) ? payload : []).map(normalizeFollowedStore).filter(Boolean));
  };

  const unfollowStore = async (session, storeSlug, options = {}) => {
    requireUserId(session);
    const slug = normalizeStoreSlug(storeSlug);
    if (!slug) throw new Error("Geçersiz mağaza kimliği.");
    return http.request(`/api/store-follows/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      signal: options.signal,
    });
  };

  const cancelOrder = async (order, options = {}) => {
    const orderId = toPositiveInteger(order?.id ?? order);
    if (!orderId) throw new Error("Geçersiz sipariş kimliği.");
    const status = asTrimmedString(order?.status);
    return http.request(`/api/orders/${orderId}/cancel`, {
      method: "POST",
      body: {
        reason_code: asTrimmedString(options.reasonCode) || "CUSTOMER_REQUEST",
        note: asTrimmedString(options.note),
        ...(status ? { expected_status: status } : {}),
      },
      signal: options.signal,
    });
  };

  // Bind private return responses to the initiating account, including delayed errors.
  const returnRequest = async (session, path, options = {}) => {
    const userId = session ? requireUserId(session) : readStoredUserId(storage);
    const token = storage?.getItem?.(TOKEN_KEY);
    const changed = () => !token || !userId || token !== storage?.getItem?.(TOKEN_KEY) || userId !== readStoredUserId(storage);
    const sessionError = () => Object.assign(new Error("Müşteri oturumu değişti."), { status: 401, code: "CUSTOMER_SESSION_CHANGED" });
    if (changed()) throw sessionError();
    try {
      const result = await http.request(path, options);
      if (changed()) throw sessionError();
      return result;
    } catch (error) {
      if (changed()) throw sessionError();
      throw error;
    }
  };

  const listReturns = async (session, options = {}) => {
    const payload = await returnRequest(session, "/api/returns/mine", options);
    if (!Array.isArray(payload)) throw Object.assign(new Error("İade listesi doğrulanamadı."), { status: 400 });
    const rows = payload.map((row) => normalizeCustomerReturn(row));
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw Object.assign(new Error("İade listesi doğrulanamadı."), { status: 400 });
    return Object.freeze(rows);
  };

  const getReturn = async (session, id, options = {}) => {
    const returnId = toPositiveInteger(id);
    if (!Number.isSafeInteger(returnId)) throw Object.assign(new Error("Geçersiz iade kimliği."), { status: 400 });
    const payload = await returnRequest(session, `/api/returns/${returnId}`, options);
    return normalizeCustomerReturn(payload, { detail: true, expectedId: returnId });
  };

  const createReturnRequest = async (order, options = {}) => {
    const orderId = toPositiveInteger(order?.id ?? order);
    if (!Number.isSafeInteger(orderId)) throw new Error("Geçersiz sipariş kimliği.");
    const payload = await returnRequest(null, "/api/returns", {
      method: "POST",
      body: {
        order_id: orderId,
        reason_code: asTrimmedString(options.reasonCode).toUpperCase(),
        note: asTrimmedString(options.note),
      },
      signal: options.signal,
    });
    const request = normalizeCustomerReturn(payload?.return);
    if (request.orderId !== orderId || typeof payload.reused !== "boolean") throw new Error("İade yanıtı doğrulanamadı; yeniden göndermeden önce iade geçmişini kontrol edin.");
    return Object.freeze({ reused: payload.reused, return: request });
  };

  const listCoupons = async (options = {}) => {
    const payload = await http.request("/api/campaigns/coupons/active", { signal: options.signal });
    return Object.freeze((Array.isArray(payload) ? payload : []).map(normalizeCustomerCoupon).filter(Boolean));
  };

  const listNotifications = async (session, options = {}) => {
    requireUserId(session);
    const payload = await http.request("/api/notifications?limit=50", { signal: options.signal });
    return Object.freeze((Array.isArray(payload?.items) ? payload.items : []).map(normalizeCustomerNotification).filter(Boolean));
  };

  const getNotificationUnreadCount = async (options = {}) => {
    const payload = await http.request("/api/notifications/unread-count", { signal: options.signal });
    const count = Number(payload?.unreadCount);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Okunmamış bildirim sayısı doğrulanamadı.");
    return count;
  };

  const markNotificationRead = async (id, options = {}) => {
    const notificationId = toPositiveInteger(id);
    if (!notificationId) throw new Error("Geçersiz bildirim kimliği.");
    return http.request(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      signal: options.signal,
    });
  };

  const markAllNotificationsRead = async (_session, options = {}) => http.request(
    "/api/notifications/read-all",
    {
      method: "PATCH",
      signal: options.signal,
    },
  );

  const webPush = Object.freeze({
    getConfig: (options = {}) => http.request("/api/notifications/web-push/config", { signal: options.signal }),
    getSubscriptionState: (options = {}) => http.request("/api/notifications/web-push/subscriptions", { signal: options.signal }),
    registerSubscription: (subscription, options = {}) => http.request(
      "/api/notifications/web-push/subscriptions",
      { method: "POST", body: { subscription }, signal: options.signal },
    ),
    revokeSubscription: ({ endpoint }, options = {}) => http.request(
      "/api/notifications/web-push/subscriptions",
      { method: "DELETE", body: { endpoint }, signal: options.signal },
    ),
    revokeSession: (options = {}) => http.request(
      "/api/notifications/web-push/subscriptions/session",
      { method: "DELETE", signal: options.signal },
    ),
  });

  const listSupportMessages = async (session, options = {}) => {
    const userId = requireUserId(session);
    const payload = await http.request(`/api/messages/history/${userId}`, { signal: options.signal });
    return Object.freeze((Array.isArray(payload) ? payload : [])
      .map((entry) => normalizeCustomerMessage(entry, userId))
      .filter(Boolean));
  };

  const sendSupportMessage = async (session, message, options = {}) => {
    const userId = requireUserId(session);
    const payload = await http.request("/api/messages/send", {
      method: "POST",
      body: { message: asTrimmedString(message) },
      signal: options.signal,
    });
    return normalizeCustomerMessage(payload, userId);
  };

  const loadDashboard = async (session, options = {}) => {
    const entries = await Promise.allSettled([
      listOrders(session, options),
      listAddresses(options),
      listCoupons(options),
      listNotifications(session, options),
    ]);
    const [orders, addresses, coupons, notifications] = entries.map((entry) => (
      entry.status === "fulfilled" ? entry.value : Object.freeze([])
    ));
    const warnings = entries
      .filter((entry) => entry.status === "rejected")
      .map((entry) => entry.reason);
    return Object.freeze({ orders, addresses, coupons, notifications, warnings: Object.freeze(warnings) });
  };

  return Object.freeze({
    login,
    register,
    forgotPassword,
    resetPassword,
    getProfile,
    updateProfile,
    changePassword,
    logout,
    listAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    setDefaultAddress,
    listOrders,
    listQuestions,
    listReviews,
    listFollowedStores,
    unfollowStore,
    cancelOrder,
    createReturnRequest,
    listReturns,
    getReturn,
    listCoupons,
    listNotifications,
    getNotificationUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    webPush,
    listSupportMessages,
    sendSupportMessage,
    loadDashboard,
  });
}

export const customerAccountAdapterTestUtils = Object.freeze({
  addressFingerprint,
  addressPayload,
  normalizeLegacyAddressPayload,
  normalizeStoreSlug,
  parseArray,
  readLegacyAddressPayloads,
  readStoredUserId,
  resolveCustomerNotificationTarget,
  requireUserId,
  safeMediaUrl,
  toPositiveInteger,
});
