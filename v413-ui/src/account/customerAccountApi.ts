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
  createdAt: string | null;
  total: number;
  items: readonly CustomerOrderItem[];
  address: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  trackingNo: string | null;
  trackingUrl: string | null;
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

const text = (value: unknown) => String(value ?? "").trim();

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
  return Object.freeze({
    id,
    status: text(source.display_status ?? source.status) || "Durum bilgisi bekleniyor",
    createdAt: text(source.created_at ?? source.createdAt) || null,
    total: Number.isFinite(total) && total >= 0 ? total : 0,
    items: Object.freeze(parseItems(source.items).map(normalizeOrderItem).filter((item): item is CustomerOrderItem => Boolean(item))),
    address: text(source.address ?? source.shipping_address ?? source.delivery_address) || null,
    paymentMethod: text(source.payment_method ?? source.paymentMethod) || null,
    paymentStatus: text(source.payment_status ?? source.paymentStatus) || null,
    trackingNo: text(source.tracking_no ?? source.trackingNo) || null,
    trackingUrl: safeMediaUrl(source.tracking_url ?? source.trackingUrl) || null,
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
  normalizeCustomerOrder,
  normalizeCustomerProfile,
  positiveInteger,
  safeMediaUrl,
});
