export const SELLER_RECRUITMENT_URL = "https://novastore-stage.com";
export const NORMAL_LOGIN_DESTINATION = "/";
export const PROFILE_COMPLETION_NOTICE_TIMEOUT_MS = 9_000;

export function customerAccountEntryPath(authenticated) {
  return authenticated ? "/hesabim" : "/giris";
}

const CONTROL_OR_BACKSLASH = /[\\\u0000-\u001f\u007f]/;
const TURKISH_MOBILE_PATTERN = /^05[0-9]{9}$/;
const CUSTOMER_RETURN_PATHS = Object.freeze([
  /^\/hesabim\/iadeler(?:\/[1-9][0-9]*)?$/,
  /^\/$/,
  /^\/urun\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/urun-id\/[1-9][0-9]*$/,
  /^\/magaza\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/favoriler$/,
  /^\/sepet$/,
  /^\/hesabim(?:\/(?:adresler|kuponlar|bildirimler|sorularim|degerlendirmelerim|takip-ettigim-magazalar|guvenlik|siparisler(?:\/[^/?#]{1,80})?))?$/,
  /^\/odeme\/(?:teslimat|odeme|onay)$/,
  /^\/siparis-takibi$/,
  /^\/destek$/,
]);

const safePaymentResultQuery = (searchParams) => {
  const allowed = new Set(["paymentRef", "orderId"]);
  for (const [key, value] of searchParams.entries()) {
    if (!allowed.has(key) || !value || value.length > 160 || CONTROL_OR_BACKSLASH.test(value)) return false;
  }
  return searchParams.has("paymentRef") || searchParams.has("orderId");
};

export function safeCustomerReturnPath(value, fallback = NORMAL_LOGIN_DESTINATION) {
  const path = String(value || "").trim();
  if (
    !path.startsWith("/")
    || path.startsWith("//")
    || path.length > 512
    || path.includes("#")
    || CONTROL_OR_BACKSLASH.test(path)
  ) return fallback;

  let parsed;
  try {
    // Parse internal route syntax without introducing a network origin.
    parsed = new URL(path, "customer-return:/");
  } catch {
    return fallback;
  }

  if (parsed.protocol !== "customer-return:" || parsed.host) return fallback;
  if (parsed.pathname === "/odeme/sonuc") {
    return safePaymentResultQuery(parsed.searchParams) ? `${parsed.pathname}${parsed.search}` : fallback;
  }
  if (parsed.search) return fallback;
  return CUSTOMER_RETURN_PATHS.some((pattern) => pattern.test(parsed.pathname)) ? parsed.pathname : fallback;
}

export function getCustomerProfileCompletion(profile) {
  const fullName = String(profile?.fullName || "").trim();
  const phone = String(profile?.phone || "").trim();
  const missingFields = [];
  if (fullName.length < 2) missingFields.push("Ad soyad");
  if (!TURKISH_MOBILE_PATTERN.test(phone)) missingFields.push("Telefon");
  return Object.freeze({
    complete: missingFields.length === 0,
    missingFields: Object.freeze(missingFields),
  });
}

export const customerAuthUxTestUtils = Object.freeze({
  CUSTOMER_RETURN_PATHS,
  TURKISH_MOBILE_PATTERN,
  safePaymentResultQuery,
});
