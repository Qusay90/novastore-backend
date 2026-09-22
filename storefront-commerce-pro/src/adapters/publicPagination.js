// Cursors are server-owned opaque values. Never inspect their contents.
export const PUBLIC_PAGE_SIZE = 20;

export function pageQuery({ cursor, limit = PUBLIC_PAGE_SIZE, ...filters } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError("Geçersiz sayfa boyutu.");
  const query = new URLSearchParams({ pagination: "cursor", limit: String(limit) });
  if (cursor != null) {
    if (typeof cursor !== "string" || !cursor.length || cursor.length > 1024) throw new TypeError("Geçersiz devam bilgisi.");
    query.set("cursor", cursor);
  }
  for (const key of ["q", "categoryId", "categorySlug", "includeDescendants", "attributes"]) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") continue;
    if (key === "attributes") {
      if (Object.keys(value).length) query.set(key, JSON.stringify(value));
    } else query.set(key, String(value));
  }
  return query.toString();
}

export function normalizePagination(value, { legacy = false } = {}) {
  if (value == null && legacy) return Object.freeze({ limit: 20, hasMore: false, nextCursor: null });
  if (!value || typeof value.hasMore !== "boolean" || !Number.isInteger(value.limit)
    || value.limit < 1 || value.limit > 100
    || (value.hasMore && (typeof value.nextCursor !== "string" || !value.nextCursor.length || value.nextCursor.length > 1024))
    || (!value.hasMore && value.nextCursor !== null)) throw new Error("Sayfa devam bilgisi doğrulanamadı.");
  return Object.freeze({ limit: value.limit, hasMore: value.hasMore, nextCursor: value.nextCursor });
}

export function appendUnique(previous, next) {
  const rows = new Map(previous.map((item) => [item.id, item]));
  for (const item of next) rows.set(item.id, item);
  return [...rows.values()];
}
