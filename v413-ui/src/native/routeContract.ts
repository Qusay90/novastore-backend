const tabByCalibration = {
  "CAL-01": ["account"],
  "CAL-02": ["home"],
  "CAL-03": ["categories"],
  "CAL-04": ["home", "favorites"],
  "CAL-05": ["home"],
  "CAL-06": ["home"],
  "CAL-07": ["cart"],
  "CAL-08": ["cart"],
  "CAL-09": ["account"],
  "CAL-10": ["account"],
  "CAL-11": ["support"],
  "CAL-12": ["support"],
} as const;

type CalId = keyof typeof tabByCalibration;

export const CANONICAL_NATIVE_ROUTE_TUPLES = [
  ["CAL-01", "account", "login"], ["CAL-01", "account", "forgot"],
  ["CAL-01", "account", "register"], ["CAL-02", "home", ""],
  ["CAL-02", "home", "search"], ["CAL-03", "categories", ""],
  ["CAL-04", "home", ""], ["CAL-04", "favorites", ""],
  ["CAL-04", "home", "store"], ["CAL-05", "home", ""],
  ["CAL-06", "home", ""], ["CAL-07", "cart", ""],
  ["CAL-08", "cart", ""], ["CAL-08", "cart", "address"],
  ["CAL-08", "cart", "success"], ["CAL-09", "account", ""],
  ["CAL-09", "account", "invoice"], ["CAL-09", "account", "tracking"],
  ["CAL-10", "account", ""], ["CAL-10", "account", "returns"],
  ["CAL-10", "account", "faq"], ["CAL-10", "account", "history"],
  ["CAL-10", "account", "addresses"], ["CAL-10", "account", "notifications"],
  ["CAL-10", "account", "profile"], ["CAL-10", "account", "payments"],
  ["CAL-10", "account", "coupons"], ["CAL-10", "account", "reviews"],
  ["CAL-10", "account", "questions"], ["CAL-10", "account", "security"],
  ["CAL-10", "account", "followed-stores"], ["CAL-10", "account", "settings"],
  ["CAL-11", "support", ""],
  ["CAL-11", "support", "faq"], ["CAL-11", "support", "history"],
  ["CAL-11", "support", "live"], ["CAL-12", "support", ""],
] as const;

const canonicalNativeRouteKeys = new Set<string>(
  CANONICAL_NATIVE_ROUTE_TUPLES.map(([cal, tab, view]) => `${cal}\u0000${tab}\u0000${view}`),
);

const STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const RETURN_ID_PATTERN = /^[1-9]\d{0,14}$/;

function safeNativeRoute() {
  return new URLSearchParams({ cal: "CAL-02", tab: "home", shell: "native" });
}

export function canonicalNativeRoute(search: URLSearchParams) {
  const rawCal = search.get("cal") ?? "CAL-02";
  if (!(rawCal in tabByCalibration)) return null;

  const cal = rawCal as CalId;
  const tab = search.get("tab") ?? tabByCalibration[cal][0];
  const rawView = search.get("view") ?? "";
  const view = cal === "CAL-01" && rawView === "" ? "login" : rawView;
  if (!(tabByCalibration[cal] as readonly string[]).includes(tab)) return null;
  if (!canonicalNativeRouteKeys.has(`${cal}\u0000${tab}\u0000${view}`)) return null;

  const result = new URLSearchParams({ cal, tab });
  if (view) result.set("view", view);
  const isStoreRoute = cal === "CAL-04" && tab === "home" && view === "store";
  const isProductRoute = cal === "CAL-06" && tab === "home" && view === "";
  const rawStoreSlug = search.get("storeSlug");
  const rawProductId = search.get("productId");
  const rawMode = search.get("mode");
  const returnIds = search.getAll("returnId");
  const returnActions = search.getAll("returnAction");
  const isReturnRoute = cal === "CAL-10" && tab === "account" && view === "returns";
  if (rawStoreSlug !== null) {
    const storeSlug = rawStoreSlug.trim().toLocaleLowerCase("en-US");
    if ((!isStoreRoute && !isProductRoute) || storeSlug.length > 160 || !STORE_SLUG_PATTERN.test(storeSlug)) {
      return null;
    }
    result.set("storeSlug", storeSlug);
  }
  if (rawProductId !== null) {
    const productId = rawProductId.trim();
    if (!isProductRoute || !PRODUCT_ID_PATTERN.test(productId)) return null;
    result.set("productId", productId);
  }
  if (rawMode !== null) {
    if ((!isStoreRoute && !isProductRoute) || (rawMode !== "customer" && rawMode !== "preview")) {
      return null;
    }
    if (rawMode === "preview" && !result.has("storeSlug")) return null;
    result.set("mode", rawMode);
  }
  if (returnIds.length || returnActions.length) {
    if (!isReturnRoute || returnIds.length > 1 || returnActions.length > 1 || (returnIds.length && returnActions.length)) {
      return null;
    }
    if (returnIds.length) {
      const returnId = returnIds[0].trim();
      if (!RETURN_ID_PATTERN.test(returnId) || !Number.isSafeInteger(Number(returnId))) return null;
      result.set("returnId", returnId);
    }
    if (returnActions.length) {
      if (returnActions[0] !== "new") return null;
      result.set("returnAction", "new");
    }
  }
  result.set("shell", "native");
  return result;
}

export function canonicalNativeRouteOrSafeDefault(search: URLSearchParams) {
  return canonicalNativeRoute(search) ?? safeNativeRoute();
}

export function nativeRouteFromAppUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const isVerifiedWebRoute =
    url.protocol === "https:" &&
    url.hostname === "novastore.tr" &&
    url.pathname === "/app/customer";
  const isPreviewRoute =
    url.protocol === "novastore:" &&
    url.hostname === "customer" &&
    (url.pathname === "" || url.pathname === "/");

  if (!isVerifiedWebRoute && !isPreviewRoute) return null;
  return canonicalNativeRoute(url.searchParams);
}
