export const RETURN_STATUS_LABELS = Object.freeze({
  REQUESTED: "Talep alındı",
  IN_REVIEW: "İnceleniyor",
  APPROVED: "İade talebi onaylandı",
  REJECTED: "İade talebi reddedildi",
  COMPLETED: "İade talebi tamamlandı",
});

export const REFUND_STATUS_LABELS = Object.freeze({
  NONE: "Geri ödeme talebi yok",
  REQUESTED: "Geri ödeme talebi alındı",
  IN_REVIEW: "Geri ödeme inceleniyor",
  APPROVED: "Geri ödeme onaylandı",
  PENDING: "Geri ödeme bekliyor",
  COMPLETED: "Geri ödeme tamamlandı",
  FAILED: "Geri ödeme işlemi başarısız; işlem gerekiyor",
  REJECTED: "Geri ödeme talebi reddedildi",
});

export const RETURN_REASON_LABELS = Object.freeze({
  CHANGED_MIND: "Fikrimi değiştirdim",
  DAMAGED: "Ürün hasarlı ulaştı",
  WRONG_ITEM: "Yanlış ürün geldi",
  NOT_AS_DESCRIBED: "Ürün açıklamayla uyuşmuyor",
  OTHER: "Diğer",
});

export const refundStatusLabel = (status) => REFUND_STATUS_LABELS[status] || "Geri ödeme durumu alınamadı";
export const returnDetailPath = (id) => `#/hesabim/iadeler/${id}`;

const invalid = () => Object.assign(new Error("İade bilgileri doğrulanamadı. Lütfen yeniden yükleyin."), { code: "CUSTOMER_RETURN_DATA_INVALID", status: 400 });
const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export function normalizeCustomerReturn(value, { detail = false, expectedId = null } = {}) {
  if (!value || Array.isArray(value) || !positiveId(value.id) || !positiveId(value.order_id)
    || !positiveId(value.revision) || !Object.hasOwn(RETURN_STATUS_LABELS, value.status)
    || !Object.hasOwn(RETURN_REASON_LABELS, value.reason_code)
    || !value.created_at || !Number.isFinite(Date.parse(value.created_at))
    || (expectedId !== null && Number(value.id) !== Number(expectedId))) throw invalid();
  const amount = value.refund_amount == null ? null : Number(value.refund_amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw invalid();
  for (const field of ["note", "decision_note"]) {
    if (value[field] != null && typeof value[field] !== "string") throw invalid();
  }
  if (detail && (!Object.hasOwn(REFUND_STATUS_LABELS, value.refund_status)
    || !["PENDING", "REQUIRES_ACTION", "WAITING_TRANSFER", "PAID", "FAILED", "REFUNDED"].includes(value.payment_status)
    || typeof value.order_status !== "string")) throw invalid();
  return Object.freeze({
    id: Number(value.id), orderId: Number(value.order_id), revision: Number(value.revision),
    status: value.status, statusLabel: RETURN_STATUS_LABELS[value.status],
    reasonCode: value.reason_code, reasonLabel: RETURN_REASON_LABELS[value.reason_code],
    note: value.note || null, decisionNote: value.decision_note || null,
    createdAt: value.created_at, requestedAmount: amount,
    orderStatus: detail ? value.order_status : null,
    paymentStatus: detail ? value.payment_status : null,
    orderRefundStatus: detail ? value.refund_status : null,
  });
}

export function returnErrorMessage(error) {
  if (error?.status === 401 || error?.code === "CUSTOMER_SESSION_CHANGED") return "Oturumunuz sona erdi veya değişti. Yeniden giriş yapın.";
  if (error?.status === 404 || error?.status === 403) return "İade talebi bulunamadı veya bu hesapla erişilemiyor.";
  if (error?.status === 400) return "İade bilgileri doğrulanamadı. Lütfen bilgileri kontrol edin ve yeniden deneyin.";
  if (error?.status === 409) return error.message || "Siparişin iade uygunluğu değişti. Güncel bilgileri yeniden yükleyin.";
  if (error?.status === 503) return "İade hizmeti şu anda kullanılamıyor. Daha sonra yeniden deneyin.";
  return "İade bilgileri yüklenemedi. Bağlantınızı kontrol ederek yeniden deneyin.";
}
