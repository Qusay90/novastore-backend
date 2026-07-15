export const ORDER_CANCEL_NOTE_MAX_LENGTH = 300;
export const ORDER_CANCEL_EXPECTED_STATUSES = Object.freeze(["Onay Bekliyor", "Hazırlanıyor"]);
export const MANUAL_SHIPMENT_EXPECTED_STATUS = "Hazırlanıyor";

export const ORDER_CANCEL_REASONS = Object.freeze([
  Object.freeze({ code: "CUSTOMER_REQUEST", label: "Müşteri talebi", noteRequired: false }),
  Object.freeze({ code: "DUPLICATE_ORDER", label: "Mükerrer sipariş", noteRequired: false }),
  Object.freeze({ code: "INVENTORY_UNAVAILABLE", label: "Stok/tedarik engeli", noteRequired: false }),
  Object.freeze({ code: "DELIVERY_ADDRESS_UNRESOLVED", label: "Teslimat adresi çözülemedi", noteRequired: false }),
  Object.freeze({ code: "POLICY_OR_FRAUD_REVIEW", label: "Politika veya dolandırıcılık incelemesi", noteRequired: true }),
]);

const cancelReasonByCode = new Map(ORDER_CANCEL_REASONS.map((reason) => [reason.code, reason]));
const cancellableStatuses = new Set(ORDER_CANCEL_EXPECTED_STATUSES);

const requireText = (value, field, { min = 1, max = 200 } = {}) => {
  const normalized = String(value || "").trim();
  if (normalized.length < min || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new TypeError(`${field} ${min}–${max} karakter aralığında olmalıdır.`);
  }
  return normalized;
};

const requireIdempotencyKey = (value) => {
  const normalized = requireText(value, "Idempotency anahtarı", { min: 8, max: 120 });
  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new TypeError("Idempotency anahtarı izin verilmeyen karakter içeriyor.");
  }
  return normalized;
};

const requireOrderId = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError("Sipariş kimliği pozitif tam sayı olmalıdır.");
  return parsed;
};

export function createMutationIdempotencyKey(kind, cryptoImpl = globalThis.crypto) {
  const prefix = requireText(kind, "İşlem türü", { min: 2, max: 32 })
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9_-]/g, "-");
  if (typeof cryptoImpl?.randomUUID !== "function") {
    throw new TypeError("Güvenli idempotency anahtarı üretilemedi.");
  }
  return `commerce-pro-${prefix}-${cryptoImpl.randomUUID()}`;
}

export function buildCancelOrderMutation(input) {
  const orderId = requireOrderId(input?.orderId);
  const expectedStatus = requireText(input?.expectedStatus, "Beklenen sipariş durumu", { max: 80 });
  if (!cancellableStatuses.has(expectedStatus)) {
    throw new TypeError("Sipariş bu durumdayken kontrollü admin iptali sunulamaz.");
  }
  const reasonCode = requireText(input?.reasonCode, "İptal nedeni", { max: 80 });
  const reason = cancelReasonByCode.get(reasonCode);
  if (!reason) throw new TypeError("İptal nedeni izin verilen listede değildir.");
  const note = String(input?.note || "").trim();
  if (note.length > ORDER_CANCEL_NOTE_MAX_LENGTH) {
    throw new TypeError(`İptal notu en fazla ${ORDER_CANCEL_NOTE_MAX_LENGTH} karakter olmalıdır.`);
  }
  if (reason.noteRequired && !note) {
    throw new TypeError("Politika veya dolandırıcılık incelemesi için açıklama zorunludur.");
  }
  const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);

  return Object.freeze({
    path: `/api/orders/${orderId}/cancel`,
    idempotencyKey,
    body: Object.freeze({
      expected_status: expectedStatus,
      reason_code: reasonCode,
      note,
    }),
  });
}

export function buildManualShipmentMutation(input) {
  const orderId = requireOrderId(input?.orderId);
  const expectedStatus = requireText(input?.expectedStatus, "Beklenen sipariş durumu", { max: 80 });
  if (expectedStatus !== MANUAL_SHIPMENT_EXPECTED_STATUS) {
    throw new TypeError("Manuel kargo devri yalnız Hazırlanıyor durumunda başlatılabilir.");
  }
  const provider = requireText(input?.provider, "Kargo sağlayıcısı", { min: 2, max: 80 });
  const trackingNo = requireText(input?.trackingNo, "Takip numarası", { min: 3, max: 120 });
  if (!/^[\p{L}\p{N} .()_-]+$/u.test(provider)) {
    throw new TypeError("Kargo sağlayıcısı desteklenmeyen karakter içeriyor.");
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(trackingNo)) {
    throw new TypeError("Takip numarası desteklenmeyen karakter içeriyor.");
  }
  if (input?.handoffConfirmed !== true) {
    throw new TypeError("Fiziksel kargo devrini doğrulamanız gerekir.");
  }
  const idempotencyKey = requireIdempotencyKey(input?.idempotencyKey);

  return Object.freeze({
    path: `/api/shipments/${orderId}/manual`,
    idempotencyKey,
    body: Object.freeze({
      expected_status: expectedStatus,
      provider,
      tracking_no: trackingNo,
      handoff_confirmed: true,
    }),
  });
}
