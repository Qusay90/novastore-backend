import { requestPublicDiscovery } from "../notifications/customerNotificationApi";
import { canonicalPublicStoreSlug, normalizeProduct, normalizePublicStoreProjection, optionalAssetUrl, type CustomerPublicProduct, type CustomerPublicStoreProjection } from "./publicStoreContract";
import { marketplacePath, type MarketplaceFilters } from "./publicReadQuery";
import { boundedItems, normalizePublicPagination, onlyPublicFields, publicId, publicNumber, publicObject, publicText, type PublicPage, PublicContentError } from "./publicPagination";
export { marketplacePath, type MarketplaceFilters };
export type MarketplaceProduct = CustomerPublicProduct & Readonly<{ store: { slug: string; name: string }; categoryIds: readonly number[] }>;
export type PublicCategory = Readonly<{ id: number; slug: string; name: string; parentId: number | null; imageUrl: string | null; children: readonly PublicCategory[] }>;
export type PublicQuestion = Readonly<{ id: number; question: string; answer: string; userName: string; answeredAt: string | null }>;
export type PublicReview = Readonly<{ id: number; rating: number; comment: string; fullName: string; createdAt: string | null; media: readonly { id: number; url: string; type: "image" | "video" }[] }>;
export type ReviewSummary = Readonly<{ average: number; total: number; permissionCode: string | null }>;
type AssetContext = { apiOrigin?: string; allowCleartextAssets?: boolean };

export function normalizeMarketplacePage(payload: unknown, assets: AssetContext = {}): PublicPage<MarketplaceProduct> {
  const root = publicObject(payload);
  onlyPublicFields(root, ["items", "limit", "hasMore", "nextCursor"]);
  const pagination = normalizePublicPagination(root);
  const items = boundedItems(root.items, pagination).map(value => {
    const row = publicObject(value);
    onlyPublicFields(row, ["id", "name", "description", "brand", "product_type", "price", "old_price", "stock", "is_purchasable",
      "variant_selection_required", "image_url", "media", "category", "categories", "categoryIds", "primaryCategoryId", "average_rating", "review_count", "store"]);
    const store = publicObject(row.store);
    onlyPublicFields(store, ["slug", "name"]);
    if (typeof row.variant_selection_required !== "boolean" || !Array.isArray(row.categoryIds)) throw new PublicContentError();
    const card = normalizeProduct({
      id: row.id, name: row.name, price: row.price, old_price: row.old_price, stock: row.stock, is_purchasable: row.is_purchasable,
      variant_selection_required: row.variant_selection_required, image_url: row.image_url, media: row.media,
      average_rating: publicNumber(row.average_rating, 5), review_count: row.review_count,
    }, assets.apiOrigin, assets.allowCleartextAssets);
    return Object.freeze({ ...card, store: Object.freeze({ slug: canonicalPublicStoreSlug(store.slug), name: publicText(store.name, 160) }),
      categoryIds: Object.freeze(row.categoryIds.map(publicId)) });
  });
  return Object.freeze({ ...pagination, items: Object.freeze(items), summary: undefined });
}
export async function loadMarketplacePage(filters: MarketplaceFilters = {}, cursor?: string) {
  const result = await requestPublicDiscovery(marketplacePath(filters, cursor));
  return normalizeMarketplacePage(result.payload, result);
}
export function normalizePublicCategoryTree(payload: unknown, assets: AssetContext = {}): readonly PublicCategory[] {
  const seen = new Set<number>();
  const visit = (value: unknown, parentId: number | null, depth: number): PublicCategory => {
    const row = publicObject(value);
    const id = publicId(row.id);
    if (depth > 32 || seen.has(id) || seen.size >= 5000 || row.parent_id !== parentId || !Array.isArray(row.children)) throw new PublicContentError();
    seen.add(id);
    return Object.freeze({ id, parentId, name: publicText(row.name, 255), slug: publicText(row.slug, 255),
      imageUrl: optionalAssetUrl(row.image_url, assets.apiOrigin, assets.allowCleartextAssets),
      children: Object.freeze(row.children.map(child => visit(child, id, depth + 1))) });
  };
  if (!Array.isArray(payload)) throw new PublicContentError();
  return Object.freeze(payload.map(row => visit(row, null, 0)));
}
export async function loadPublicCategoryTree() {
  const result = await requestPublicDiscovery("/api/public/categories?format=tree");
  return normalizePublicCategoryTree(result.payload, result);
}
const publicDate = (value: unknown) => value == null ? null : publicText(value, 80);
export function normalizePublicQuestions(payload: unknown): PublicPage<PublicQuestion> {
  const root = publicObject(payload);
  onlyPublicFields(root, ["items", "limit", "hasMore", "nextCursor"]);
  const pagination = normalizePublicPagination(root);
  const items = boundedItems(root.items, pagination).map(value => {
    const row = publicObject(value);
    onlyPublicFields(row, ["id", "question", "answer", "user_name", "created_at", "answered_at", "status", "is_answered"]);
    const answer = publicText(row.answer);
    if (!answer.trim() || row.status !== "answered" || row.is_answered !== true) throw new PublicContentError();
    return Object.freeze({ id: publicId(row.id), question: publicText(row.question), answer,
      userName: publicText(row.user_name, 255), answeredAt: publicDate(row.answered_at) });
  });
  return Object.freeze({ ...pagination, items: Object.freeze(items), summary: undefined });
}
export function normalizePublicReviews(payload: unknown, assets: AssetContext = {}): PublicPage<PublicReview, ReviewSummary> {
  const root = publicObject(payload);
  onlyPublicFields(root, ["reviews", "average", "totalReviews", "reviewPermission", "pagination"]);
  const pagination = normalizePublicPagination(root.pagination);
  const items = boundedItems(root.reviews, pagination).map(value => {
    const row = publicObject(value);
    onlyPublicFields(row, ["id", "rating", "comment", "created_at", "full_name", "media"]);
    if (!Array.isArray(row.media) || row.media.length > 4) throw new PublicContentError();
    const media = row.media.map(value => {
      const item = publicObject(value);
      onlyPublicFields(item, ["id", "media_url", "media_type", "sort_order"]);
      if (item.media_type !== "image" && item.media_type !== "video") throw new PublicContentError();
      const url = optionalAssetUrl(item.media_url, assets.apiOrigin, assets.allowCleartextAssets);
      if (!url) throw new PublicContentError();
      return Object.freeze({ id: publicId(item.id), url, type: item.media_type as "image" | "video" });
    });
    const rating = publicNumber(row.rating, 5);
    if (!Number.isInteger(rating) || rating < 1) throw new PublicContentError();
    return Object.freeze({ id: publicId(row.id), rating, comment: row.comment == null ? "" : publicText(row.comment),
      fullName: publicText(row.full_name, 255), createdAt: publicDate(row.created_at), media: Object.freeze(media) });
  });
  const permission = publicObject(root.reviewPermission);
  const total = publicNumber(root.totalReviews);
  if (!Number.isInteger(total) || total < items.length) throw new PublicContentError();
  return Object.freeze({ ...pagination, items: Object.freeze(items),
    summary: Object.freeze({ average: publicNumber(root.average, 5), total,
      permissionCode: typeof permission.code === "string" ? publicText(permission.code, 128) : null }) });
}
const reputationPath = (kind: "questions" | "reviews", id: string, cursor?: string) => {
  const query = new URLSearchParams({ limit: "20", pagination: "cursor" });
  if (cursor) query.set("cursor", cursor);
  return "/api/" + kind + "/product/" + publicId(id) + "?" + query.toString();
};
export async function loadPublicQuestionPage(id: string, cursor?: string) {
  return normalizePublicQuestions((await requestPublicDiscovery(reputationPath("questions", id, cursor))).payload);
}
export async function loadPublicReviewPage(id: string, cursor?: string) {
  const result = await requestPublicDiscovery(reputationPath("reviews", id, cursor));
  return normalizePublicReviews(result.payload, result);
}
export async function loadPublicStorePage(slug: string, cursor?: string): Promise<PublicPage<CustomerPublicProduct, CustomerPublicStoreProjection["store"]>> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) query.set("cursor", cursor);
  const result = await requestPublicDiscovery("/api/public/stores/" + canonicalPublicStoreSlug(slug) + "?" + query.toString());
  const projection = normalizePublicStoreProjection(result.payload, slug, result.apiOrigin, result.allowCleartextAssets);
  if (!projection.pagination) throw new PublicContentError();
  boundedItems(projection.products, projection.pagination);
  return Object.freeze({ ...projection.pagination, items: projection.products, summary: projection.store });
}
