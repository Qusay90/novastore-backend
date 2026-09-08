export function normalizeAdminOrderDetail(payload, orderId) {
  if (!payload || Number(payload.id) !== Number(orderId) || !Number.isSafeInteger(Number(payload.id))) {
    throw new TypeError("Sipariş detayının kimliği doğrulanamadı.");
  }
  const source = payload.deliveryRecipient;
  if (!source || source.source !== "order_snapshot") throw new TypeError("Sipariş teslimat kaynağı doğrulanamadı.");
  const text = (value) => typeof value === "string" && value.trim() ? value : null;
  const recipient = Object.freeze(Object.fromEntries(
    ["name", "phone", "addressLine", "cityOrProvince", "district", "postalCode", "note"].map((key) => [key, text(source[key])]),
  ));
  return Object.freeze({
    id: Number(payload.id),
    deliveryRecipient: recipient,
    missingDeliveryFields: Object.freeze(["name", "phone", "addressLine"].filter((key) => !recipient[key])),
  });
}
