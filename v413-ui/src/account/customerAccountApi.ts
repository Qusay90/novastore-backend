import {
  CustomerNotificationApiError,
  requestCustomerApi,
} from "../notifications/customerNotificationApi";

export type CustomerProfile = Readonly<{
  id: number;
  fullName: string;
  email: string;
  phone: string | null;
  role: "customer";
}>;

export type CustomerAddress = Readonly<{
  id: number;
  title: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  addressLine: string;
  isDefault: boolean;
}>;

export type CustomerAddressInput = Readonly<Omit<CustomerAddress, "id">>;

export type CustomerOrderItem = Readonly<{
  id: number | null;
  name: string;
  quantity: number;
  price: number;
  image: string;
}>;

export type CustomerOrder = Readonly<{
  id: number;
  status: string;
  displayStatus: string;
  statusNote: string | null;
  isPendingPayment: boolean;
  isPaymentFailed: boolean;
  createdAt: string | null;
  deliveredAt: string | null;
  total: number;
  items: readonly CustomerOrderItem[];
  address: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  refundStatus: string | null;
  trackingNo: string | null;
  trackingUrl: string | null;
  returnId: number | null;
  returnStatus: string | null;
  returnRevision: number | null;
  returnDecisionNote: string | null;
}>;

export const CUSTOMER_RETURN_STATUSES = Object.freeze([
  "REQUESTED", "IN_REVIEW", "APPROVED", "REJECTED", "COMPLETED",
] as const);
export type CustomerReturnStatus = typeof CUSTOMER_RETURN_STATUSES[number] | "UNKNOWN";

export const CUSTOMER_REFUND_STATUSES = Object.freeze([
  "NONE", "REQUESTED", "IN_REVIEW", "APPROVED", "PENDING", "COMPLETED", "FAILED", "REJECTED",
] as const);
export type CustomerRefundStatus = typeof CUSTOMER_REFUND_STATUSES[number] | "UNKNOWN";

export type CustomerReturn = Readonly<{
  id: number;
  orderId: number;
  reasonCode: string;
  note: string | null;
  status: CustomerReturnStatus;
  refundAmount: number | null;
  revision: number;
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  orderStatus: string | null;
  paymentStatus: string | null;
  refundStatus: CustomerRefundStatus | null;
}>;

export type CustomerReturnCreation = Readonly<{
  reused: boolean;
  return: CustomerReturn;
}>;

export type CustomerSupportMessage = Readonly<{
  id: number;
  message: string;
  sentByCustomer: boolean;
  isSystem: boolean;
  createdAt: string | null;
}>;

export type CustomerSecurityStatus = Readonly<{
  email: string;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  hasPassword: boolean;
}>;

export type CustomerCoupon = Readonly<{
  id: number;
  code: string;
  discountType: "PERCENT" | "FIXED";
  discountValue: number;
  minOrderAmount: number;
  maxDiscountAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
}>;

export type CustomerQuestion = Readonly<{
  id: number;
  productId: number;
  productName: string;
  productImage: string;
  question: string;
  answer: string | null;
  status: "pending" | "answered";
  createdAt: string | null;
  answeredAt: string | null;
}>;

export type CustomerReviewStatus = "PENDING" | "PUBLISHED" | "HIDDEN";

export type CustomerReview = Readonly<{
  id: number;
  productId: number;
  productName: string;
  productImage: string;
  rating: number;
  comment: string | null;
  status: CustomerReviewStatus;
  createdAt: string | null;
}>;

export type CustomerFollowedStore = Readonly<{
  slug: string;
  name: string;
  following: true;
  followerCount: number;
  followedAt: string | null;
}>;

export type CustomerStoreFollowState = Readonly<{
  slug: string;
  following: boolean;
  followerCount: number;
}>;

export type CustomerFavoriteMutation = Readonly<{
  productId: number;
  favorited: boolean;
}>;

const text = (value: unknown) => String(value ?? "").trim();
const CUSTOMER_RETURN_REASON_CODES = new Set(["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "CHANGED_MIND", "OTHER"]);
const CUSTOMER_RETURN_STATUS_SET = new Set<string>(CUSTOMER_RETURN_STATUSES);
const CUSTOMER_REFUND_STATUS_SET = new Set<string>(CUSTOMER_REFUND_STATUSES);
const CUSTOMER_REVIEW_STATUSES = new Set<CustomerReviewStatus>(["PENDING", "PUBLISHED", "HIDDEN"]);
const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,63}$/u;
const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_ACCOUNT_LIST_SIZE = 2_000;
const MAX_MONEY_VALUE = 99_999_999.99;

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeMediaUrl(value: unknown) {
  const normalized = text(value);
  if (!normalized) return "";
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function boundedText(value: unknown, maxLength: number) {
  const normalized = text(value);
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function optionalTimestamp(value: unknown) {
  const normalized = text(value);
  if (!normalized) return null;
  if (normalized.length > 64 || Number.isNaN(Date.parse(normalized))) return null;
  return normalized;
}

function boundedMoney(value: unknown, options: Readonly<{ positive?: boolean; nullable?: boolean }> = {}) {
  if (options.nullable && (value === null || value === undefined || value === "")) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount > MAX_MONEY_VALUE || (options.positive ? amount <= 0 : amount < 0)) return null;
  if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7) return null;
  return Number(amount.toFixed(2));
}

function normalizeList<T>(
  value: unknown,
  normalize: (entry: unknown) => T | null,
  label: string,
  code: string,
) {
  if (!Array.isArray(value) || value.length > MAX_ACCOUNT_LIST_SIZE) {
    throw new CustomerNotificationApiError(`${label} doğrulanamadı.`, 0, code);
  }
  return Object.freeze(value.map(normalize).filter((entry): entry is T => Boolean(entry)));
}

function normalizeStoreSlug(value: unknown) {
  const slug = text(value).toLocaleLowerCase("en-US");
  return slug.length <= 160 && STORE_SLUG_PATTERN.test(slug) ? slug : null;
}

export function normalizeCustomerFavoriteProductIds(value: unknown): readonly number[] | null {
  const source = objectValue(value);
  if (!source || !Array.isArray(source.productIds) || source.productIds.length > MAX_ACCOUNT_LIST_SIZE) return null;
  const ids = source.productIds.map(positiveInteger);
  if (ids.some((id) => id === null)) return null;
  const normalized = ids as number[];
  if (new Set(normalized).size !== normalized.length) return null;
  return Object.freeze(normalized);
}

function normalizeCustomerFavoriteMutation(value: unknown, expectedProductId: number, expectedFavorited: boolean): CustomerFavoriteMutation | null {
  const source = objectValue(value);
  const productId = positiveInteger(source?.productId ?? source?.product_id);
  if (!source || productId !== expectedProductId || source.favorited !== expectedFavorited) return null;
  return Object.freeze({ productId, favorited: expectedFavorited });
}

export function normalizeCustomerProfile(value: unknown): CustomerProfile | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  const email = text(source?.email).toLowerCase();
  const role = text(source?.role).toLowerCase();
  if (!source || !id || !email || role !== "customer") return null;
  return Object.freeze({
    id,
    fullName: text(source.fullName ?? source.full_name ?? source.name),
    email,
    phone: text(source.phone) || null,
    role: "customer",
  });
}

export function normalizeCustomerCoupon(value: unknown): CustomerCoupon | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  const code = text(source?.code).toLocaleUpperCase("en-US");
  const discountType = text(source?.discount_type ?? source?.discountType).toLocaleUpperCase("en-US");
  const discountValue = boundedMoney(source?.discount_value ?? source?.discountValue, { positive: true });
  const minOrderAmount = boundedMoney(source?.min_order_amount ?? source?.minOrderAmount);
  const rawMaxDiscountAmount = source?.max_discount_amount ?? source?.maxDiscountAmount;
  const maxDiscountAmount = boundedMoney(rawMaxDiscountAmount, { positive: true, nullable: true });
  const rawStartsAt = source?.starts_at ?? source?.startsAt;
  const rawEndsAt = source?.ends_at ?? source?.endsAt;
  const startsAt = optionalTimestamp(rawStartsAt);
  const endsAt = optionalTimestamp(rawEndsAt);
  if (
    !source
    || !id
    || !COUPON_CODE_PATTERN.test(code)
    || (discountType !== "PERCENT" && discountType !== "FIXED")
    || discountValue === null
    || minOrderAmount === null
    || (text(rawMaxDiscountAmount) && maxDiscountAmount === null)
    || (text(rawStartsAt) && startsAt === null)
    || (text(rawEndsAt) && endsAt === null)
    || (discountType === "PERCENT" && discountValue > 100)
  ) return null;
  return Object.freeze({
    id,
    code,
    discountType,
    discountValue,
    minOrderAmount,
    maxDiscountAmount,
    startsAt,
    endsAt,
  });
}

export function normalizeCustomerQuestion(value: unknown): CustomerQuestion | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  const productId = positiveInteger(source?.product_id ?? source?.productId);
  const productName = boundedText(source?.product_name ?? source?.productName, 240);
  const question = boundedText(source?.question, 1_000);
  const answer = text(source?.answer) ? boundedText(source?.answer, 2_000) : null;
  const rawCreatedAt = source?.created_at ?? source?.createdAt;
  const rawAnsweredAt = source?.answered_at ?? source?.answeredAt;
  const createdAt = optionalTimestamp(rawCreatedAt);
  const answeredAt = optionalTimestamp(rawAnsweredAt);
  if (
    !source
    || !id
    || !productId
    || !productName
    || !question
    || (text(source.answer) && !answer)
    || (text(rawCreatedAt) && !createdAt)
    || (text(rawAnsweredAt) && !answeredAt)
  ) return null;
  return Object.freeze({
    id,
    productId,
    productName,
    productImage: safeMediaUrl(source.product_image ?? source.productImage ?? source.image_url),
    question,
    answer,
    status: answer ? "answered" : "pending",
    createdAt,
    answeredAt,
  });
}

export function normalizeCustomerReview(value: unknown): CustomerReview | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  const productId = positiveInteger(source?.product_id ?? source?.productId);
  const productName = boundedText(source?.product_name ?? source?.productName, 240);
  const rating = Number(source?.rating);
  const status = text(source?.status).toLocaleUpperCase("en-US") as CustomerReviewStatus;
  const rawComment = text(source?.comment);
  const comment = rawComment ? boundedText(rawComment, 2_000) : null;
  const rawCreatedAt = source?.created_at ?? source?.createdAt;
  const createdAt = optionalTimestamp(rawCreatedAt);
  if (
    !source
    || !id
    || !productId
    || !productName
    || !Number.isInteger(rating)
    || rating < 1
    || rating > 5
    || !CUSTOMER_REVIEW_STATUSES.has(status)
    || (rawComment && !comment)
    || (text(rawCreatedAt) && !createdAt)
  ) return null;
  return Object.freeze({
    id,
    productId,
    productName,
    productImage: safeMediaUrl(source.image_url ?? source.product_image ?? source.productImage),
    rating,
    comment,
    status,
    createdAt,
  });
}

export function normalizeCustomerFollowedStore(value: unknown): CustomerFollowedStore | null {
  const source = objectValue(value);
  const slug = normalizeStoreSlug(source?.store_slug ?? source?.storeSlug ?? source?.slug);
  const name = boundedText(source?.store_name ?? source?.storeName ?? source?.name, 160);
  const followerCount = Number(source?.follower_count ?? source?.followerCount ?? 0);
  const rawFollowedAt = source?.followed_at ?? source?.followedAt;
  const followedAt = optionalTimestamp(rawFollowedAt);
  if (
    !source
    || !slug
    || !name
    || source.following !== true
    || !Number.isSafeInteger(followerCount)
    || followerCount < 0
    || (text(rawFollowedAt) && !followedAt)
  ) return null;
  return Object.freeze({
    slug,
    name,
    following: true,
    followerCount,
    followedAt,
  });
}

export function normalizeCustomerStoreFollowState(value: unknown): CustomerStoreFollowState | null {
  const source = objectValue(value);
  const slug = normalizeStoreSlug(source?.store_slug ?? source?.storeSlug);
  const followerCount = Number(source?.follower_count ?? source?.followerCount);
  if (
    !source
    || !slug
    || typeof source.following !== "boolean"
    || !Number.isSafeInteger(followerCount)
    || followerCount < 0
  ) return null;
  return Object.freeze({ slug, following: source.following, followerCount });
}

export function normalizeCustomerAddress(value: unknown): CustomerAddress | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  if (!source || !id) return null;
  const addressLine = text(source.addressLine ?? source.address_line ?? source.detail);
  const city = text(source.city);
  const district = text(source.district);
  if (!addressLine || !city || !district) return null;
  return Object.freeze({
    id,
    title: text(source.title ?? source.label) || "Adres",
    fullName: text(source.fullName ?? source.full_name ?? source.recipientName),
    phone: text(source.phone),
    city,
    district,
    addressLine,
    isDefault: source.isDefault === true || source.is_default === true,
  });
}

function parseItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOrderItem(value: unknown): CustomerOrderItem | null {
  const source = objectValue(value);
  if (!source) return null;
  const name = text(source.name);
  const price = Number(source.price ?? 0);
  if (!name || !Number.isFinite(price) || price < 0) return null;
  return Object.freeze({
    id: positiveInteger(source.id ?? source.productId ?? source.product_id),
    name,
    quantity: Math.max(1, Number.parseInt(text(source.quantity || 1), 10) || 1),
    price,
    image: safeMediaUrl(source.image ?? source.imageUrl ?? source.image_url),
  });
}

export function normalizeCustomerOrder(value: unknown): CustomerOrder | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  if (!source || !id) return null;
  const total = Number(source.total_amount ?? source.total ?? 0);
  const status = text(source.status) || "Durum bilgisi bekleniyor";
  return Object.freeze({
    id,
    status,
    displayStatus: text(source.display_status) || status,
    statusNote: text(source.status_note ?? source.statusNote) || null,
    isPendingPayment: source.is_pending_payment === true || source.isPendingPayment === true,
    isPaymentFailed: source.is_payment_failed === true || source.isPaymentFailed === true,
    createdAt: text(source.created_at ?? source.createdAt) || null,
    deliveredAt: text(source.delivered_at ?? source.deliveredAt) || null,
    total: Number.isFinite(total) && total >= 0 ? total : 0,
    items: Object.freeze(parseItems(source.items).map(normalizeOrderItem).filter((item): item is CustomerOrderItem => Boolean(item))),
    address: text(source.address ?? source.shipping_address ?? source.delivery_address) || null,
    paymentMethod: text(source.payment_method ?? source.paymentMethod) || null,
    paymentStatus: text(source.payment_status ?? source.paymentStatus) || null,
    refundStatus: text(source.refund_status ?? source.refundStatus) || null,
    trackingNo: text(source.tracking_no ?? source.trackingNo) || null,
    trackingUrl: safeMediaUrl(source.tracking_url ?? source.trackingUrl) || null,
    returnId: positiveInteger(source.return_id ?? source.returnId),
    returnStatus: text(source.return_status ?? source.returnStatus) || null,
    returnRevision: positiveInteger(source.return_revision ?? source.returnRevision),
    returnDecisionNote: text(source.return_decision_note ?? source.returnDecisionNote) || null,
  });
}

export function normalizeCustomerReturn(value: unknown): CustomerReturn | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  const orderId = positiveInteger(source?.order_id ?? source?.orderId);
  const reasonCode = text(source?.reason_code ?? source?.reasonCode);
  const rawStatus = text(source?.status).toUpperCase();
  const revision = positiveInteger(source?.revision);
  if (!source || !id || !orderId || !reasonCode || !rawStatus || !revision) return null;
  const refundAmount = source.refund_amount === null || source.refund_amount === undefined
    ? null
    : Number(source.refund_amount);
  if (refundAmount !== null && (!Number.isFinite(refundAmount) || refundAmount < 0)) return null;
  return Object.freeze({
    id,
    orderId,
    reasonCode,
    note: text(source.note) || null,
    status: CUSTOMER_RETURN_STATUS_SET.has(rawStatus) ? rawStatus as CustomerReturnStatus : "UNKNOWN",
    refundAmount,
    revision,
    decisionNote: text(source.decision_note ?? source.decisionNote) || null,
    decidedAt: text(source.decided_at ?? source.decidedAt) || null,
    createdAt: text(source.created_at ?? source.createdAt) || null,
    updatedAt: text(source.updated_at ?? source.updatedAt) || null,
    orderStatus: text(source.order_status ?? source.orderStatus) || null,
    paymentStatus: text(source.payment_status ?? source.paymentStatus) || null,
    refundStatus: (() => {
      const rawRefundStatus = text(source.refund_status ?? source.refundStatus).toUpperCase();
      if (!rawRefundStatus) return null;
      return CUSTOMER_REFUND_STATUS_SET.has(rawRefundStatus)
        ? rawRefundStatus as CustomerRefundStatus
        : "UNKNOWN";
    })(),
  });
}

function normalizeSupportMessage(value: unknown, customerId: number): CustomerSupportMessage | null {
  const source = objectValue(value);
  const id = positiveInteger(source?.id);
  const message = text(source?.message);
  if (!source || !id || !message) return null;
  return Object.freeze({
    id,
    message,
    sentByCustomer: Number(source.sender_id ?? source.senderId) === customerId,
    isSystem: source.is_ai_handoff === true || message.startsWith("[AI DESTEK DEVRI]"),
    createdAt: text(source.created_at ?? source.createdAt) || null,
  });
}

function requireId(value: unknown, label: string) {
  const id = positiveInteger(value);
  if (!id) throw new CustomerNotificationApiError(`${label} kimliği geçersiz.`, 0, "CUSTOMER_ACCOUNT_ID_INVALID");
  return id;
}

function addressPayload(value: CustomerAddressInput) {
  return {
    title: text(value.title),
    fullName: text(value.fullName),
    phone: text(value.phone),
    city: text(value.city),
    district: text(value.district),
    addressLine: text(value.addressLine),
    isDefault: value.isDefault === true,
  };
}

export async function getCurrentCustomer() {
  const payload = objectValue(await requestCustomerApi("/api/users/me"));
  const user = normalizeCustomerProfile(payload?.user ?? payload);
  if (!user) throw new CustomerNotificationApiError("Müşteri profili doğrulanamadı.", 0, "CUSTOMER_PROFILE_RESPONSE_INVALID");
  return user;
}

export async function registerCustomer(fullName: string, email: string, password: string) {
  if (text(fullName).length < 2 || !text(email) || password.length < 8) {
    throw new CustomerNotificationApiError("Kayıt bilgileri eksik veya geçersiz.", 0, "CUSTOMER_REGISTER_INPUT_INVALID");
  }
  return requestCustomerApi("/api/users/register", "POST", {
    fullName: text(fullName), email: text(email).toLowerCase(), password,
  }, false);
}

export async function requestPasswordRecovery(email: string) {
  if (!text(email)) throw new CustomerNotificationApiError("E-posta gerekli.", 0, "CUSTOMER_RECOVERY_INPUT_INVALID");
  return requestCustomerApi("/api/auth/forgot-password", "POST", { email: text(email).toLowerCase() }, false);
}

export async function updateCustomerProfile(fullName: string, phone: string) {
  const payload = objectValue(await requestCustomerApi("/api/users/me", "PATCH", {
    fullName: text(fullName), phone: text(phone) || null,
  }));
  const user = normalizeCustomerProfile(payload?.user ?? payload);
  if (!user) throw new CustomerNotificationApiError("Güncel profil doğrulanamadı.", 0, "CUSTOMER_PROFILE_RESPONSE_INVALID");
  return user;
}

export async function getCustomerSecurityStatus(): Promise<CustomerSecurityStatus> {
  const source = objectValue(await requestCustomerApi("/api/users/security-status"));
  if (!source || !text(source.email)) throw new CustomerNotificationApiError("Güvenlik durumu doğrulanamadı.", 0, "CUSTOMER_SECURITY_RESPONSE_INVALID");
  return Object.freeze({
    email: text(source.email),
    emailVerified: source.emailVerified === true,
    phone: text(source.phone) || null,
    phoneVerified: source.phoneVerified === true,
    twoFactorEnabled: source.twoFactorEnabled === true,
    hasPassword: source.hasPassword === true,
  });
}

export async function changeCustomerPassword(currentPassword: string, newPassword: string) {
  if (
    typeof currentPassword !== "string"
    || typeof newPassword !== "string"
    || !currentPassword
    || newPassword.length < 8
    || newPassword.length > 128
    || !/[A-Za-zÇĞİÖŞÜçğıöşü]/u.test(newPassword)
    || !/\d/u.test(newPassword)
    || currentPassword === newPassword
  ) {
    throw new CustomerNotificationApiError("Şifre bilgileri geçersiz.", 0, "CUSTOMER_PASSWORD_INPUT_INVALID");
  }
  const payload = objectValue(await requestCustomerApi("/api/users/change-password", "POST", {
    currentPassword,
    newPassword,
  }));
  const message = boundedText(payload?.message, 240);
  if (!payload || !message) {
    throw new CustomerNotificationApiError("Şifre güncelleme yanıtı doğrulanamadı.", 0, "CUSTOMER_PASSWORD_RESPONSE_INVALID");
  }
  return Object.freeze({ message });
}

export async function listCustomerAddresses() {
  const payload = await requestCustomerApi("/api/addresses");
  if (!Array.isArray(payload)) throw new CustomerNotificationApiError("Adres listesi doğrulanamadı.", 0, "CUSTOMER_ADDRESS_RESPONSE_INVALID");
  return Object.freeze(payload.map(normalizeCustomerAddress).filter((item): item is CustomerAddress => Boolean(item)));
}

export async function createCustomerAddress(value: CustomerAddressInput) {
  const address = normalizeCustomerAddress(await requestCustomerApi("/api/addresses", "POST", addressPayload(value)));
  if (!address) throw new CustomerNotificationApiError("Adres oluşturma yanıtı doğrulanamadı.", 0, "CUSTOMER_ADDRESS_RESPONSE_INVALID");
  return address;
}

export async function updateCustomerAddress(id: number, value: CustomerAddressInput) {
  const addressId = requireId(id, "Adres");
  const address = normalizeCustomerAddress(await requestCustomerApi(`/api/addresses/${addressId}`, "PUT", addressPayload(value)));
  if (!address) throw new CustomerNotificationApiError("Adres güncelleme yanıtı doğrulanamadı.", 0, "CUSTOMER_ADDRESS_RESPONSE_INVALID");
  return address;
}

export async function deleteCustomerAddress(id: number) {
  await requestCustomerApi(`/api/addresses/${requireId(id, "Adres")}`, "DELETE");
}

export async function makeDefaultCustomerAddress(id: number) {
  const address = normalizeCustomerAddress(await requestCustomerApi(`/api/addresses/${requireId(id, "Adres")}/default`, "PATCH"));
  if (!address) throw new CustomerNotificationApiError("Varsayılan adres yanıtı doğrulanamadı.", 0, "CUSTOMER_ADDRESS_RESPONSE_INVALID");
  return address;
}

export async function listCustomerOrders(customerId: number) {
  const payload = await requestCustomerApi(`/api/orders/user/${requireId(customerId, "Müşteri")}`);
  if (!Array.isArray(payload)) throw new CustomerNotificationApiError("Sipariş listesi doğrulanamadı.", 0, "CUSTOMER_ORDER_RESPONSE_INVALID");
  return Object.freeze(payload.map(normalizeCustomerOrder).filter((item): item is CustomerOrder => Boolean(item)));
}

export async function listCustomerCoupons() {
  const payload = await requestCustomerApi("/api/campaigns/coupons/active");
  return normalizeList(payload, normalizeCustomerCoupon, "Kupon listesi", "CUSTOMER_COUPON_RESPONSE_INVALID");
}

export async function listCustomerQuestions() {
  const payload = await requestCustomerApi("/api/questions/user");
  return normalizeList(payload, normalizeCustomerQuestion, "Soru geçmişi", "CUSTOMER_QUESTION_RESPONSE_INVALID");
}

export async function listCustomerReviews(currentProfileId: number) {
  const customerId = requireId(currentProfileId, "Müşteri");
  const payload = await requestCustomerApi(`/api/reviews/user/${customerId}`);
  return normalizeList(payload, normalizeCustomerReview, "Değerlendirme geçmişi", "CUSTOMER_REVIEW_RESPONSE_INVALID");
}

export async function listCustomerFavoriteProductIds() {
  const ids = normalizeCustomerFavoriteProductIds(await requestCustomerApi("/api/favorites"));
  if (!ids) throw new CustomerNotificationApiError("Favori listesi doğrulanamadı.", 0, "CUSTOMER_FAVORITES_RESPONSE_INVALID");
  return ids;
}

async function requestCustomerFavoriteMutation(value: number, method: "POST" | "DELETE") {
  const productId = requireId(value, "Ürün");
  const expectedFavorited = method === "POST";
  const mutation = normalizeCustomerFavoriteMutation(
    await requestCustomerApi(`/api/favorites/${productId}`, method),
    productId,
    expectedFavorited,
  );
  if (!mutation) {
    throw new CustomerNotificationApiError("Favori işlemi sunucu tarafından doğrulanmadı.", 0, "CUSTOMER_FAVORITE_RESPONSE_INVALID");
  }
  return mutation;
}

export function addCustomerFavorite(value: number) {
  return requestCustomerFavoriteMutation(value, "POST");
}

export function removeCustomerFavorite(value: number) {
  return requestCustomerFavoriteMutation(value, "DELETE");
}

export async function submitCustomerProductQuestion(productIdValue: number, questionValue: string) {
  const productId = requireId(productIdValue, "Ürün");
  const question = typeof questionValue === "string" ? questionValue.trim() : "";
  if (question.length < 5 || question.length > 1_000 || CONTROL_CHARACTER_PATTERN.test(question)) {
    throw new CustomerNotificationApiError("Soru 5 ile 1000 karakter arasında olmalıdır.", 0, "CUSTOMER_QUESTION_INPUT_INVALID");
  }
  const payload = objectValue(await requestCustomerApi("/api/questions/ask", "POST", { product_id: productId, question }));
  const created = objectValue(payload?.question);
  if (
    !payload
    || !created
    || !positiveInteger(created.id)
    || positiveInteger(created.product_id ?? created.productId) !== productId
    || text(created.question) !== question
    || text(created.status).toLowerCase() !== "pending"
    || created.is_answered !== false
  ) {
    throw new CustomerNotificationApiError("Soru gönderme yanıtı doğrulanamadı.", 0, "CUSTOMER_QUESTION_RESPONSE_INVALID");
  }
  return Object.freeze({ id: positiveInteger(created.id)!, productId, question, status: "pending" as const });
}

export async function submitCustomerProductReview(productIdValue: number, ratingValue: number, commentValue: string) {
  const productId = requireId(productIdValue, "Ürün");
  const rating = Number(ratingValue);
  const comment = typeof commentValue === "string" ? commentValue.trim() : "";
  if (!Number.isSafeInteger(rating) || rating < 1 || rating > 5 || comment.length > 2_000 || CONTROL_CHARACTER_PATTERN.test(comment)) {
    throw new CustomerNotificationApiError("Değerlendirme bilgileri geçersiz.", 0, "CUSTOMER_REVIEW_INPUT_INVALID");
  }
  const payload = objectValue(await requestCustomerApi("/api/reviews", "POST", {
    productId,
    rating,
    comment: comment || null,
  }));
  const reviewId = positiveInteger(payload?.reviewId ?? payload?.review_id);
  if (!payload || !reviewId || text(payload.status).toUpperCase() !== "PENDING") {
    throw new CustomerNotificationApiError("Değerlendirme yanıtı doğrulanamadı.", 0, "CUSTOMER_REVIEW_RESPONSE_INVALID");
  }
  return Object.freeze({ reviewId, productId, status: "PENDING" as const });
}

export async function listCustomerFollowedStores() {
  const payload = await requestCustomerApi("/api/store-follows");
  return normalizeList(payload, normalizeCustomerFollowedStore, "Takip edilen mağaza listesi", "CUSTOMER_FOLLOWED_STORE_RESPONSE_INVALID");
}

async function requestCustomerStoreFollowState(value: string, method: "GET" | "POST" | "DELETE") {
  const slug = normalizeStoreSlug(value);
  if (!slug) throw new CustomerNotificationApiError("Mağaza kimliği geçersiz.", 0, "CUSTOMER_STORE_SLUG_INVALID");
  const state = normalizeCustomerStoreFollowState(
    await requestCustomerApi(`/api/store-follows/${encodeURIComponent(slug)}`, method),
  );
  if (!state || state.slug !== slug) {
    throw new CustomerNotificationApiError("Mağaza takip yanıtı doğrulanamadı.", 0, "CUSTOMER_FOLLOWED_STORE_RESPONSE_INVALID");
  }
  return state;
}

export function getCustomerStoreFollowState(value: string) {
  return requestCustomerStoreFollowState(value, "GET");
}

export async function followCustomerStore(value: string) {
  const state = await requestCustomerStoreFollowState(value, "POST");
  if (!state.following) {
    throw new CustomerNotificationApiError("Mağaza takip işlemi sunucu tarafından doğrulanmadı.", 0, "CUSTOMER_STORE_FOLLOW_NOT_CONFIRMED");
  }
  return state;
}

export async function unfollowCustomerStore(value: string) {
  const state = await requestCustomerStoreFollowState(value, "DELETE");
  if (state.following) {
    throw new CustomerNotificationApiError("Mağaza takipten çıkarma işlemi sunucu tarafından doğrulanmadı.", 0, "CUSTOMER_STORE_UNFOLLOW_NOT_CONFIRMED");
  }
  return state;
}

export async function cancelCustomerOrder(id: number, expectedStatus: string, reasonCode = "CUSTOMER_REQUEST") {
  const orderId = requireId(id, "Sipariş");
  const normalizedStatus = text(expectedStatus);
  const normalizedReason = text(reasonCode).toUpperCase();
  if (!normalizedStatus || !/^[A-Z0-9_]{3,50}$/u.test(normalizedReason)) {
    throw new CustomerNotificationApiError("Sipariş iptal bilgisi geçersiz.", 0, "CUSTOMER_ORDER_CANCEL_INPUT_INVALID");
  }
  const payload = objectValue(await requestCustomerApi(`/api/orders/${orderId}/cancel`, "POST", {
    reason_code: normalizedReason,
    expected_status: normalizedStatus,
  }));
  const order = normalizeCustomerOrder(payload?.order);
  if (!order || order.id !== orderId) {
    throw new CustomerNotificationApiError("Sipariş iptal yanıtı doğrulanamadı.", 0, "CUSTOMER_ORDER_RESPONSE_INVALID");
  }
  return order;
}

export async function listCustomerReturns() {
  const payload = await requestCustomerApi("/api/returns/mine");
  if (!Array.isArray(payload)) throw new CustomerNotificationApiError("İade listesi doğrulanamadı.", 0, "CUSTOMER_RETURN_RESPONSE_INVALID");
  const items = payload.map(normalizeCustomerReturn);
  if (items.some((item) => !item)) {
    throw new CustomerNotificationApiError("İade listesi doğrulanamadı.", 0, "CUSTOMER_RETURN_RESPONSE_INVALID");
  }
  return Object.freeze(items as CustomerReturn[]);
}

export async function getCustomerReturn(returnId: number) {
  const id = requireId(returnId, "İade talebi");
  const result = normalizeCustomerReturn(await requestCustomerApi(`/api/returns/${id}`));
  if (!result || result.id !== id) {
    throw new CustomerNotificationApiError("İade talebi ayrıntısı doğrulanamadı.", 0, "CUSTOMER_RETURN_RESPONSE_INVALID");
  }
  return result;
}

export async function createCustomerReturn(orderId: number, reasonCode: string, note = "") {
  const safeOrderId = requireId(orderId, "Sipariş");
  const normalizedReason = text(reasonCode).toUpperCase();
  const normalizedNote = text(note);
  if (!CUSTOMER_RETURN_REASON_CODES.has(normalizedReason) || normalizedNote.length > 1000) {
    throw new CustomerNotificationApiError("İade talebi bilgisi geçersiz.", 0, "CUSTOMER_RETURN_INPUT_INVALID");
  }
  const payload = objectValue(await requestCustomerApi("/api/returns", "POST", {
    order_id: safeOrderId,
    reason_code: normalizedReason,
    ...(normalizedNote ? { note: normalizedNote } : {}),
  }));
  const result = normalizeCustomerReturn(payload?.return);
  if (!result || result.orderId !== safeOrderId) {
    throw new CustomerNotificationApiError("İade talebi yanıtı doğrulanamadı.", 0, "CUSTOMER_RETURN_RESPONSE_INVALID");
  }
  return Object.freeze({ reused: payload?.reused === true, return: result }) satisfies CustomerReturnCreation;
}

export async function listCustomerSupportMessages(customerId: number) {
  const id = requireId(customerId, "Müşteri");
  const payload = await requestCustomerApi(`/api/messages/history/${id}`);
  if (!Array.isArray(payload)) throw new CustomerNotificationApiError("Destek geçmişi doğrulanamadı.", 0, "CUSTOMER_SUPPORT_RESPONSE_INVALID");
  return Object.freeze(payload.map((entry) => normalizeSupportMessage(entry, id)).filter((item): item is CustomerSupportMessage => Boolean(item)));
}

export async function sendCustomerSupportMessage(customerId: number, message: string) {
  const id = requireId(customerId, "Müşteri");
  const normalized = text(message);
  if (!normalized) throw new CustomerNotificationApiError("Destek mesajı boş olamaz.", 0, "CUSTOMER_SUPPORT_INPUT_INVALID");
  const sent = normalizeSupportMessage(await requestCustomerApi("/api/messages/send", "POST", { message: normalized }), id);
  if (!sent) throw new CustomerNotificationApiError("Destek mesajı yanıtı doğrulanamadı.", 0, "CUSTOMER_SUPPORT_RESPONSE_INVALID");
  return sent;
}

export const customerAccountApiTestUtils = Object.freeze({
  normalizeCustomerAddress,
  normalizeCustomerCoupon,
  normalizeCustomerFollowedStore,
  normalizeCustomerFavoriteProductIds,
  normalizeCustomerStoreFollowState,
  normalizeCustomerOrder,
  normalizeCustomerQuestion,
  normalizeCustomerReview,
  normalizeCustomerReturn,
  normalizeCustomerProfile,
  normalizeStoreSlug,
  positiveInteger,
  safeMediaUrl,
});
