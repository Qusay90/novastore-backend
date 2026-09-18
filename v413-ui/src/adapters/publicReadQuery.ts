const STORE = /^\/api\/public\/stores\/(?=[a-z0-9-]{1,160}$)[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REPUTATION = /^\/api\/(?:questions|reviews)\/product\/[1-9]\d*$/u;
export function publicReadKind(path: string) {
  return path === "/api/products" ? "marketplace" : path === "/api/public/categories" ? "categories"
    : STORE.test(path) ? "store" : REPUTATION.test(path) ? "reputation" : null;
}
/** These rules only grant GET access to existing public resources. */
export function validPublicReadQuery(url: URL): boolean {
  const kind = publicReadKind(url.pathname);
  if (!kind) return false;
  const allowed = kind === "categories" ? ["format"] : [
    "limit", "cursor", "pagination",
    ...(kind === "marketplace" ? ["q", "categoryId", "categorySlug", "includeDescendants", "attributes"] : []),
  ];
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    if (seen.has(key) || !allowed.includes(key) || /[\u0000-\u001f\u007f]/u.test(value)) return false;
    seen.add(key);
    if (key === "limit" && (!/^[1-9]\d{0,2}$/u.test(value) || Number(value) > 100)) return false;
    if (key === "cursor" && !/^[A-Za-z0-9_-]{1,1024}$/u.test(value)) return false;
    if (key === "pagination" && value !== "cursor") return false;
    if (key === "format" && value !== "tree") return false;
    if (key === "q" && value.length > 120) return false;
    if (key === "categoryId" && (!/^[1-9]\d{0,9}$/u.test(value) || Number(value) > 2147483647)) return false;
    if (key === "categorySlug" && (!value || value.length > 255)) return false;
    if (key === "includeDescendants" && !["true", "false"].includes(value)) return false;
    if (key === "attributes") {
      if (value.length > 4096) return false;
      try {
        const attributes = JSON.parse(value);
        if (!attributes || typeof attributes !== "object" || Array.isArray(attributes) || Object.keys(attributes).length > 20) return false;
      } catch { return false; }
    }
  }
  return true;
}
export type MarketplaceFilters = Readonly<{
  q?: string; categoryId?: number; categorySlug?: string; includeDescendants?: boolean;
  attributes?: Readonly<Record<string, unknown>>;
}>;
export function marketplacePath(filters: MarketplaceFilters = {}, cursor?: string): string {
  const query = new URLSearchParams({ pagination: "cursor", limit: "20" });
  if (filters.q?.trim()) query.set("q", filters.q.trim());
  if (filters.categoryId !== undefined) query.set("categoryId", String(filters.categoryId));
  if (filters.categorySlug) query.set("categorySlug", filters.categorySlug);
  if (filters.includeDescendants !== undefined) query.set("includeDescendants", String(filters.includeDescendants));
  if (filters.attributes && Object.keys(filters.attributes).length) query.set("attributes", JSON.stringify(filters.attributes));
  if (cursor) query.set("cursor", cursor);
  const path = "/api/products?" + query.toString();
  if (!validPublicReadQuery(new URL(path, "https://novastore.invalid"))) throw new Error("PUBLIC_QUERY_INVALID");
  return path;
}
