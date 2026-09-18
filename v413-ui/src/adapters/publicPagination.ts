export type PublicPagination = Readonly<{ limit: number; hasMore: boolean; nextCursor: string | null }>;
export type PublicPage<T, M = undefined> = PublicPagination & Readonly<{ items: readonly T[]; summary: M }>;
export class PublicContentError extends Error {
  readonly code = "PUBLIC_CONTENT_INVALID";
}
export function publicObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PublicContentError();
  return value as Record<string, unknown>;
}
export function onlyPublicFields(source: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(source).some(key => !allowed.includes(key))) throw new PublicContentError();
}
export function publicText(value: unknown, maximum = 20000): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new PublicContentError();
  return value;
}
export function publicNumber(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^\d+(?:\.\d+)?$/u.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) throw new PublicContentError();
  return parsed;
}
export function publicId(value: unknown): number {
  const id = publicNumber(value, 2147483647);
  if (!Number.isInteger(id) || id < 1) throw new PublicContentError();
  return id;
}
export function normalizePublicPagination(value: unknown): PublicPagination {
  const row = publicObject(value);
  const limit = publicId(row.limit);
  if (limit > 100 || typeof row.hasMore !== "boolean"
    || !(row.nextCursor === null || typeof row.nextCursor === "string" && /^[A-Za-z0-9_-]{1,1024}$/u.test(row.nextCursor))
    || row.hasMore !== (row.nextCursor !== null)) throw new PublicContentError();
  return Object.freeze({ limit, hasMore: row.hasMore, nextCursor: row.nextCursor });
}
export function boundedItems(value: unknown, page: PublicPagination): unknown[] {
  if (!Array.isArray(value) || value.length > page.limit || (page.hasMore && !value.length)) throw new PublicContentError();
  return value;
}
