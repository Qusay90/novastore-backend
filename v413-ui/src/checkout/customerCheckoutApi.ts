import {
  CustomerNotificationApiError,
  openApprovedPaymentUrl,
  requestCustomerApi,
} from "../notifications/customerNotificationApi";

export type CustomerCheckoutCartItem = Readonly<{
  id: number;
  quantity: number;
  name?: string;
  image?: string;
}>;

export type CustomerPaymentCapability = Readonly<{
  provider: "paytr" | null;
  ready: boolean;
  state: string;
  message: string;
  requirements: Readonly<{
    providerReady: boolean;
    businessIdentityReady: boolean;
    legalDocumentsReady: boolean;
  }>;
}>;

export type CustomerCheckoutAgreement = Readonly<{
  slug: string;
  path: string;
  title: string;
  version: string;
  text: string;
  contentSha256: string;
}>;

export type CustomerCheckoutQuoteItem = Readonly<{
  id: number;
  name: string;
  quantity: number;
  price: number;
  lineTotal: number;
  image: string | null;
}>;

export type CustomerCheckoutQuote = Readonly<{
  totals: Readonly<{
    subtotal: number;
    discount: number;
    shipping: number;
    total: number;
    currency: string;
  }>;
  items: readonly CustomerCheckoutQuoteItem[];
  couponApplied: boolean;
  couponCode: string | null;
}>;

export type CustomerCheckoutPreview = Readonly<{
  schemaVersion: "checkout-agreements-v2";
  snapshotSha256: string;
  documents: readonly CustomerCheckoutAgreement[];
  quote: CustomerCheckoutQuote;
}>;

export type CustomerPaymentResponse = Readonly<{
  orderId: number;
  paymentRef: string;
  paymentStatus: string;
  provider: "paytr";
  idempotencyKey: string;
  totals: CustomerCheckoutQuote["totals"];
  paymentActionUrl: string;
  message: string;
}>;

export type CustomerPaymentStatus = Readonly<{
  orderId: number;
  paymentRef: string;
  paymentStatus: string;
  orderStatus: string | null;
  finalized: boolean;
  providerFinalized: boolean;
  commerceFinalized: boolean;
  reconciliationRequired: boolean;
  message: string;
  nextAction: string | null;
}>;

type CheckoutRequest = Readonly<{
  addressId: number;
  cartItems: readonly CustomerCheckoutCartItem[];
  couponCode?: string | null;
}>;

type CustomerPaymentInitializeInput = CheckoutRequest & Readonly<{
  preview: CustomerCheckoutPreview;
  acceptedSlugs: readonly string[];
  idempotencyKey: string;
}>;

const SHA256 = /^[a-f0-9]{64}$/u;
const PAYTR_PATH_PREFIX = "/odeme/guvenli/";
const REQUIRED_AGREEMENT_SLUGS = Object.freeze(["pre-information", "distance-sale"] as const);
const MAX_DISTINCT_CART_ITEMS = 20;
const MAX_QUANTITY_PER_ITEM = 20;
const MAX_TOTAL_CART_QUANTITY = 50;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function positiveId(value: unknown) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function checkoutError(message: string, code: string) {
  return new CustomerNotificationApiError(message, 0, code);
}

function normalizeTotals(value: unknown): CustomerCheckoutQuote["totals"] | null {
  const source = objectValue(value);
  if (!source) return null;
  const subtotal = money(source.subtotal);
  const total = money(source.total);
  const bundleDiscount = money(source.bundleDiscount ?? 0);
  const couponDiscount = money(source.couponDiscount ?? source.discount ?? source.discountAmount ?? 0);
  const discount = bundleDiscount === null || couponDiscount === null ? null : bundleDiscount + couponDiscount;
  const shipping = money(source.shippingFee ?? source.shipping ?? source.shippingAmount ?? 0);
  const currency = text(source.currency).toUpperCase();
  if (subtotal === null || total === null || discount === null || shipping === null || currency !== "TRY") return null;
  if (Math.abs(Math.max(0, subtotal - discount) + shipping - total) > 0.011) return null;
  return Object.freeze({ subtotal, discount, shipping, total, currency });
}

function normalizePaymentAction(value: unknown) {
  const source = objectValue(value);
  if (!source || text(source.type).toLowerCase() !== "iframe") return "";
  const direct = text(source.iframeUrl);
  const token = text(source.token);
  const candidate = direct || (token ? `https://www.paytr.com${PAYTR_PATH_PREFIX}${encodeURIComponent(token)}` : "");
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:"
      || parsed.hostname.toLowerCase() !== "www.paytr.com"
      || !parsed.pathname.startsWith(PAYTR_PATH_PREFIX)
      || parsed.pathname === PAYTR_PATH_PREFIX
      || parsed.username
      || parsed.password
      || parsed.hash
    ) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function canonicalCartItems(items: readonly CustomerCheckoutCartItem[]) {
  if (!Array.isArray(items) || items.length === 0) throw checkoutError("Sepet boş olamaz.", "CHECKOUT_CART_EMPTY");
  const byProductId = new Map<number, { id: number; quantity: number; name?: string; image?: string }>();
  for (const item of items) {
    const id = positiveId(item.id);
    const quantity = Number(item.quantity);
    if (!id || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY_PER_ITEM) {
      throw checkoutError("Sepet ürünü geçersiz.", "CHECKOUT_CART_ITEM_INVALID");
    }
    const existing = byProductId.get(id);
    const nextQuantity = (existing?.quantity ?? 0) + quantity;
    if (nextQuantity > MAX_QUANTITY_PER_ITEM) {
      throw checkoutError("Bir ürün için en fazla 20 adet seçebilirsin.", "CHECKOUT_CART_ITEM_LIMIT");
    }
    byProductId.set(id, {
      id,
      quantity: nextQuantity,
      ...(text(item.name ?? existing?.name) ? { name: text(item.name ?? existing?.name) } : {}),
      ...(text(item.image ?? existing?.image) ? { image: text(item.image ?? existing?.image) } : {}),
    });
  }
  if (byProductId.size > MAX_DISTINCT_CART_ITEMS) {
    throw checkoutError("Sepette en fazla 20 farklı ürün olabilir.", "CHECKOUT_CART_DISTINCT_LIMIT");
  }
  const canonical = [...byProductId.values()];
  if (canonical.reduce((total, item) => total + item.quantity, 0) > MAX_TOTAL_CART_QUANTITY) {
    throw checkoutError("Sepette toplam en fazla 50 ürün olabilir.", "CHECKOUT_CART_TOTAL_LIMIT");
  }
  return Object.freeze(canonical);
}

function requestBody(input: CheckoutRequest) {
  const addressId = positiveId(input.addressId);
  if (!addressId) throw checkoutError("Geçerli teslimat adresi seçilmelidir.", "CHECKOUT_ADDRESS_INVALID");
  return {
    addressId,
    cartItems: canonicalCartItems(input.cartItems),
    couponCode: text(input.couponCode) || null,
  };
}

export async function getCustomerPaymentCapability(): Promise<CustomerPaymentCapability> {
  const source = objectValue(await requestCustomerApi("/api/payments/capability"));
  const requirements = objectValue(source?.requirements);
  const state = text(source?.state);
  const message = text(source?.message);
  if (!source || !requirements || !state || !message || typeof source.ready !== "boolean") {
    throw checkoutError("Ödeme hazırlık durumu doğrulanamadı.", "CHECKOUT_CAPABILITY_RESPONSE_INVALID");
  }
  const provider = text(source.provider).toLowerCase();
  if (provider && provider !== "paytr") throw checkoutError("Ödeme sağlayıcısı doğrulanamadı.", "CHECKOUT_PROVIDER_INVALID");
  return Object.freeze({
    provider: provider === "paytr" ? "paytr" : null,
    ready: source.ready,
    state,
    message,
    requirements: Object.freeze({
      providerReady: requirements.providerReady === true,
      businessIdentityReady: requirements.businessIdentityReady === true,
      legalDocumentsReady: requirements.legalDocumentsReady === true,
    }),
  });
}

export async function previewCustomerCheckout(input: CheckoutRequest): Promise<CustomerCheckoutPreview> {
  const source = objectValue(await requestCustomerApi(
    "/api/payments/agreements/preview",
    "POST",
    requestBody(input),
  ));
  const schemaVersion = text(source?.schemaVersion);
  const snapshotSha256 = text(source?.snapshotSha256).toLowerCase();
  const quoteSource = objectValue(source?.quote);
  const totals = normalizeTotals(quoteSource?.totals);
  if (!source || schemaVersion !== "checkout-agreements-v2" || !SHA256.test(snapshotSha256) || !quoteSource || !totals) {
    throw checkoutError("Sunucu sipariş özeti doğrulanamadı.", "CHECKOUT_PREVIEW_RESPONSE_INVALID");
  }
  const documents = Array.isArray(source.documents) ? source.documents.map((value) => {
    const document = objectValue(value);
    const slug = text(document?.slug);
    const path = text(document?.path);
    const title = text(document?.title);
    const version = text(document?.version);
    const documentText = text(document?.text);
    const contentSha256 = text(document?.contentSha256).toLowerCase();
    if (!slug || !path.startsWith("/") || !title || !version || !documentText || !SHA256.test(contentSha256)) return null;
    return Object.freeze({ slug, path, title, version, text: documentText, contentSha256 });
  }).filter((value): value is CustomerCheckoutAgreement => Boolean(value)) : [];
  const documentSlugs = new Set(documents.map((document) => document.slug));
  if (
    documents.length !== REQUIRED_AGREEMENT_SLUGS.length
    || documents.length !== (source.documents as unknown[]).length
    || documentSlugs.size !== REQUIRED_AGREEMENT_SLUGS.length
    || REQUIRED_AGREEMENT_SLUGS.some((slug) => !documentSlugs.has(slug))
  ) {
    throw checkoutError("Sipariş sözleşmeleri doğrulanamadı.", "CHECKOUT_AGREEMENT_RESPONSE_INVALID");
  }
  const items = Array.isArray(quoteSource.items) ? quoteSource.items.map((value) => {
    const item = objectValue(value);
    const id = positiveId(item?.id);
    const quantity = Number(item?.quantity);
    const price = money(item?.price);
    const lineTotal = money(item?.line_total ?? item?.lineTotal);
    const name = text(item?.name);
    if (
      !id
      || !Number.isSafeInteger(quantity)
      || quantity < 1
      || quantity > MAX_QUANTITY_PER_ITEM
      || price === null
      || lineTotal === null
      || Math.abs(price * quantity - lineTotal) > 0.011
      || !name
    ) return null;
    return Object.freeze({ id, name, quantity, price, lineTotal, image: text(item?.image) || null });
  }).filter((value): value is CustomerCheckoutQuoteItem => Boolean(value)) : [];
  const itemIds = new Set(items.map((item) => item.id));
  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0);
  const quotedSubtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  if (
    items.length < 1
    || items.length !== (quoteSource.items as unknown[]).length
    || items.length > MAX_DISTINCT_CART_ITEMS
    || itemIds.size !== items.length
    || totalQuantity > MAX_TOTAL_CART_QUANTITY
    || Math.abs(quotedSubtotal - totals.subtotal) > 0.011
  ) {
    throw checkoutError("Sunucu sipariş kalemleri doğrulanamadı.", "CHECKOUT_QUOTE_RESPONSE_INVALID");
  }
  const coupon = objectValue(quoteSource.coupon);
  return Object.freeze({
    schemaVersion: "checkout-agreements-v2",
    snapshotSha256,
    documents: Object.freeze(documents),
    quote: Object.freeze({
      totals,
      items: Object.freeze(items),
      couponApplied: coupon?.applied === true,
      couponCode: coupon?.applied === true ? text(coupon.code) || null : null,
    }),
  });
}

function createCustomerPaymentInitializeBody(input: CustomerPaymentInitializeInput) {
  const accepted = new Set(input.acceptedSlugs);
  if (input.preview.documents.some((document) => !accepted.has(document.slug))) {
    throw checkoutError("Güncel sözleşmelerin tümünü onaylamalısın.", "CHECKOUT_AGREEMENT_ACCEPTANCE_REQUIRED");
  }
  const idempotencyKey = text(input.idempotencyKey);
  if (!/^[A-Za-z0-9._:-]{8,120}$/u.test(idempotencyKey)) {
    throw checkoutError("Ödeme tekrar güvenliği oluşturulamadı.", "CHECKOUT_IDEMPOTENCY_INVALID");
  }
  return {
    ...requestBody(input),
    paymentMethod: "card",
    idempotency_key: idempotencyKey,
    agreementSnapshotSha256: input.preview.snapshotSha256,
    agreementAcceptances: input.preview.documents.map((document) => ({
      slug: document.slug,
      version: document.version,
      accepted: true,
    })),
  };
}

export async function initializeCustomerPayment(
  input: CustomerPaymentInitializeInput,
): Promise<CustomerPaymentResponse> {
  const initializeBody = createCustomerPaymentInitializeBody(input);
  const idempotencyKey = initializeBody.idempotency_key;
  const source = objectValue(await requestCustomerApi("/api/payments/initialize", "POST", initializeBody));
  const orderId = positiveId(source?.orderId);
  const paymentRef = text(source?.paymentRef);
  const paymentStatus = text(source?.paymentStatus);
  const provider = text(source?.provider).toLowerCase();
  const returnedIdempotencyKey = text(source?.idempotencyKey);
  const totals = normalizeTotals(source?.totals);
  const paymentActionUrl = normalizePaymentAction(source?.paymentAction);
  const message = text(source?.message);
  if (!source || !orderId || !paymentRef || paymentStatus !== "REQUIRES_ACTION" || provider !== "paytr" || returnedIdempotencyKey !== idempotencyKey || !totals || !paymentActionUrl || !message) {
    throw checkoutError("Güvenli ödeme başlangıç yanıtı doğrulanamadı.", "CHECKOUT_INITIALIZE_RESPONSE_INVALID");
  }
  return Object.freeze({
    orderId,
    paymentRef,
    paymentStatus,
    provider: "paytr",
    idempotencyKey: returnedIdempotencyKey,
    totals,
    paymentActionUrl,
    message,
  });
}

export async function openCustomerPaymentSurface(response: CustomerPaymentResponse) {
  await openApprovedPaymentUrl(response.paymentActionUrl);
}

export async function getCustomerPaymentStatus(paymentRef: string, orderId: number): Promise<CustomerPaymentStatus> {
  const safeOrderId = positiveId(orderId);
  const safePaymentRef = text(paymentRef);
  if (!safeOrderId || !/^[A-Za-z0-9._:-]{1,160}$/u.test(safePaymentRef)) {
    throw checkoutError("Ödeme durumu kimliği geçersiz.", "CHECKOUT_STATUS_ID_INVALID");
  }
  const params = new URLSearchParams({ paymentRef: safePaymentRef, orderId: String(safeOrderId) });
  const source = objectValue(await requestCustomerApi(`/api/payments/status?${params.toString()}`));
  const responseOrderId = positiveId(source?.orderId);
  const responsePaymentRef = text(source?.paymentRef);
  const paymentStatus = text(source?.paymentStatus);
  const message = text(source?.message);
  if (!source || responseOrderId !== safeOrderId || responsePaymentRef !== safePaymentRef || !paymentStatus || !message) {
    throw checkoutError("Ödeme durumu yanıtı doğrulanamadı.", "CHECKOUT_STATUS_RESPONSE_INVALID");
  }
  return Object.freeze({
    orderId: responseOrderId,
    paymentRef: responsePaymentRef,
    paymentStatus,
    orderStatus: text(source.orderStatus) || null,
    finalized: source.finalized === true,
    providerFinalized: source.providerFinalized === true,
    commerceFinalized: source.commerceFinalized === true,
    reconciliationRequired: source.reconciliationRequired === true,
    message,
    nextAction: text(source.nextAction) || null,
  });
}

export function createCheckoutIdempotencyKey() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) throw checkoutError("Ödeme tekrar güvenliği oluşturulamadı.", "CHECKOUT_IDEMPOTENCY_UNAVAILABLE");
  return `android-${uuid}`;
}

export const customerCheckoutApiTestUtils = Object.freeze({
  canonicalCartItems,
  createCustomerPaymentInitializeBody,
  normalizePaymentAction,
  normalizeTotals,
});
