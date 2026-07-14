export const COMMERCE_CAPABILITY_KEYS = Object.freeze([
  "dashboardRead",
  "ordersRead",
  "returnsRead",
  "firstPartyCatalogRead",
  "catalogStructureRead",
  "notificationsRead",
  "manualShipmentWrite",
  "orderCancelWrite",
  "orderStatusWrite",
  "orderBulkWrite",
  "orderOwnerWrite",
  "customerAdmin",
  "sellerAdmin",
  "sellerOffers",
  "settlements",
  "payouts",
]);

export function resolveCapabilities(input) {
  const source = input && typeof input === "object" ? input : {};
  return Object.freeze(Object.fromEntries(
    COMMERCE_CAPABILITY_KEYS.map((key) => [key, source[key] === true]),
  ));
}

export function hasCapability(capabilities, key) {
  return COMMERCE_CAPABILITY_KEYS.includes(key) && capabilities?.[key] === true;
}
