import { normalizePublicPagination, type PublicPagination } from "./publicPagination.ts";
export const PUBLIC_STORE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CustomerStorePresentationMode = "customer" | "preview";

export type CustomerCardFraming = Readonly<{
  focalX: number;
  focalY: number;
  zoom: number;
}>;

export type CustomerPublicProductMedia = Readonly<{
  id: string;
  url: string;
  isMain: boolean;
  sortOrder: number;
  cardFraming: CustomerCardFraming | null;
}>;

export type CustomerPublicProduct = Readonly<{
  variantSelectionRequired?: boolean;
  id: string;
  slug: string;
  name: string;
  price: number;
  oldPrice: number | null;
  stock: number;
  isPurchasable: boolean;
  imageUrl: string | null;
  media: readonly CustomerPublicProductMedia[];
  averageRating: number;
  reviewCount: number;
}>;

export type CustomerPublicStore = Readonly<{
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  status: "open" | "closed";
  rating: number | null;
  reviewCount: number;
  followerCount: number;
  totalUnitsSold: number;
  productCount: number;
  shippingSummary: string;
  returnSummary: string;
}>;

export type CustomerPublicStoreProjection = Readonly<{
  pagination?: PublicPagination;
  store: CustomerPublicStore;
  products: readonly CustomerPublicProduct[];
}>;

export type CustomerProductCardMedia = Readonly<{
  id: string;
  url: string;
  cardFraming: CustomerCardFraming | null;
}>;

export class PublicStoreContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PublicStoreContractError";
    this.code = code;
  }
}

const ROOT_FIELDS = new Set(["store", "products", "pagination"]);
const STORE_FIELDS = new Set([
  "slug", "name", "description", "logo_url", "banner_url", "status", "rating",
  "review_count", "follower_count", "total_units_sold", "product_count",
  "shipping_summary", "return_summary",
]);
const PRODUCT_FIELDS = new Set([
  "variant_selection_required",
  "id", "slug", "name", "price", "old_price", "stock", "is_purchasable",
  "image_url", "media", "average_rating", "review_count",
]);
const MEDIA_FIELDS = new Set([
  "id", "product_id", "media_url", "is_main", "sort_order", "media_type",
  "card_framing",
]);
const FRAMING_FIELDS = new Set(["focal_x", "focal_y", "zoom"]);

function objectValue(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PublicStoreContractError(code);
  }
  return value as Record<string, unknown>;
}

function assertOnlyFields(source: Record<string, unknown>, allowed: ReadonlySet<string>) {
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new PublicStoreContractError("UNEXPECTED_PUBLIC_FIELD");
  }
}

function requiredString(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== "string") throw new PublicStoreContractError(code);
  const normalized = value.trim().slice(0, maxLength);
  if (!normalized) throw new PublicStoreContractError(code);
  return normalized;
}

function optionalString(value: unknown, maxLength: number): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new PublicStoreContractError("PUBLIC_STRING_INVALID");
  return value.trim().slice(0, maxLength);
}

function finiteNumber(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new PublicStoreContractError(code);
  }
  return value;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const number = finiteNumber(value, "PUBLIC_INTEGER_INVALID");
  if (!Number.isInteger(number)) throw new PublicStoreContractError("PUBLIC_INTEGER_INVALID");
  return Math.max(0, number);
}

function optionalBoolean(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "boolean") throw new PublicStoreContractError("PUBLIC_BOOLEAN_INVALID");
  return value;
}

export function optionalAssetUrl(value: unknown, assetOrigin?: string, allowCleartextAssetOrigin = false): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new PublicStoreContractError("PUBLIC_MEDIA_URL_INVALID");
  const candidate = value.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    if (candidate.startsWith("/") && !assetOrigin) return candidate;
    url = assetOrigin ? new URL(candidate, assetOrigin) : new URL(candidate);
  } catch {
    throw new PublicStoreContractError("PUBLIC_MEDIA_URL_INVALID");
  }
  if (url.username || url.password) throw new PublicStoreContractError("PUBLIC_MEDIA_URL_INVALID");
  if (url.protocol === "https:") return url.toString();
  if (allowCleartextAssetOrigin && url.protocol === "http:" && assetOrigin) {
    try {
      const origin = new URL(assetOrigin);
      if (
        origin.protocol === "http:"
        && url.origin === origin.origin
      ) {
        return url.toString();
      }
    } catch {
      throw new PublicStoreContractError("PUBLIC_MEDIA_URL_INVALID");
    }
  }
  throw new PublicStoreContractError("PUBLIC_MEDIA_URL_INVALID");
}

export function canonicalPublicStoreSlug(value: unknown): string {
  if (typeof value !== "string") throw new PublicStoreContractError("INVALID_PUBLIC_STORE_SLUG");
  const slug = value.trim().toLocaleLowerCase("en-US");
  if (slug.length < 1 || slug.length > 160 || !PUBLIC_STORE_SLUG_PATTERN.test(slug)) {
    throw new PublicStoreContractError("INVALID_PUBLIC_STORE_SLUG");
  }
  return slug;
}

export const DEFAULT_CUSTOMER_CARD_FRAMING: CustomerCardFraming = Object.freeze({
  focalX: 0.5,
  focalY: 0.5,
  zoom: 1,
});

export function resolveCustomerCardFraming(value: unknown): CustomerCardFraming {
  if (value === null || value === undefined) return DEFAULT_CUSTOMER_CARD_FRAMING;
  const framing = objectValue(value, "CARD_FRAMING_INVALID");
  assertOnlyFields(framing, FRAMING_FIELDS);
  const focalX = finiteNumber(framing.focal_x, "CARD_FRAMING_INVALID");
  const focalY = finiteNumber(framing.focal_y, "CARD_FRAMING_INVALID");
  const zoom = finiteNumber(framing.zoom, "CARD_FRAMING_INVALID");
  if (focalX < 0 || focalX > 1 || focalY < 0 || focalY > 1 || zoom < 1 || zoom > 3) {
    return DEFAULT_CUSTOMER_CARD_FRAMING;
  }
  return Object.freeze({ focalX, focalY, zoom });
}

function normalizeMedia(value: unknown, productId: string, assetOrigin?: string, allowCleartextAssetOrigin = false): CustomerPublicProductMedia | null {
  const source = objectValue(value, "PUBLIC_MEDIA_INVALID");
  assertOnlyFields(source, MEDIA_FIELDS);
  const mediaType = optionalString(source.media_type, 32).toLocaleLowerCase("en-US");
  if (mediaType !== "image") return null;
  const url = optionalAssetUrl(source.media_url, assetOrigin, allowCleartextAssetOrigin);
  if (!url) return null;
  const idValue = source.id;
  const id = typeof idValue === "number" && Number.isSafeInteger(idValue)
    ? String(idValue)
    : requiredString(idValue, "PUBLIC_MEDIA_ID_INVALID", 128);
  if (source.product_id !== null && source.product_id !== undefined) {
    const mediaProductId = finiteNumber(source.product_id, "PUBLIC_MEDIA_PRODUCT_ID_INVALID");
    if (!Number.isSafeInteger(mediaProductId) || String(mediaProductId) !== productId) {
      throw new PublicStoreContractError("PUBLIC_MEDIA_PRODUCT_ID_MISMATCH");
    }
  }
  return Object.freeze({
    id,
    url,
    isMain: optionalBoolean(source.is_main),
    sortOrder: nonNegativeInteger(source.sort_order),
    cardFraming: source.card_framing === null || source.card_framing === undefined
      ? null
      : resolveCustomerCardFraming(source.card_framing),
  });
}

export function normalizeProduct(value: unknown, assetOrigin?: string, allowCleartextAssetOrigin = false): CustomerPublicProduct {
  const source = objectValue(value, "PUBLIC_STORE_PRODUCT_INVALID");
  assertOnlyFields(source, PRODUCT_FIELDS);
  const numericId = finiteNumber(source.id, "PUBLIC_STORE_PRODUCT_ID_INVALID");
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    throw new PublicStoreContractError("PUBLIC_STORE_PRODUCT_ID_INVALID");
  }
  const price = finiteNumber(source.price, "PUBLIC_STORE_PRODUCT_PRICE_INVALID");
  if (price < 0) throw new PublicStoreContractError("PUBLIC_STORE_PRODUCT_PRICE_INVALID");
  const oldPriceValue = source.old_price;
  const oldPrice = oldPriceValue === null || oldPriceValue === undefined
    ? null
    : finiteNumber(oldPriceValue, "PUBLIC_STORE_PRODUCT_OLD_PRICE_INVALID");
  const rating = source.average_rating === null || source.average_rating === undefined
    ? 0
    : finiteNumber(source.average_rating, "PUBLIC_STORE_PRODUCT_RATING_INVALID");
  const rawMedia = source.media === null || source.media === undefined ? [] : source.media;
  if (!Array.isArray(rawMedia)) throw new PublicStoreContractError("PUBLIC_MEDIA_INVALID");
  const productId = String(numericId);
  const media = rawMedia
    .map((item) => normalizeMedia(item, productId, assetOrigin, allowCleartextAssetOrigin))
    .filter((item): item is CustomerPublicProductMedia => item !== null);

  return Object.freeze({
    id: productId,
    slug: optionalString(source.slug, 255),
    name: requiredString(source.name, "PUBLIC_STORE_PRODUCT_NAME_MISSING", 255),
    price,
    oldPrice: oldPrice !== null && oldPrice > price ? oldPrice : null,
    stock: nonNegativeInteger(source.stock),
    isPurchasable: optionalBoolean(source.is_purchasable),
    imageUrl: optionalAssetUrl(source.image_url, assetOrigin, allowCleartextAssetOrigin),
    media: Object.freeze(media),
    averageRating: Math.min(5, Math.max(0, rating)),
    reviewCount: nonNegativeInteger(source.review_count),
    ...(source.variant_selection_required === undefined ? {} : { variantSelectionRequired: optionalBoolean(source.variant_selection_required) }),
  });
}

export function normalizePublicStoreProjection(
  payload: unknown,
  requestedSlug: string,
  assetOrigin?: string,
  allowCleartextAssetOrigin = false,
): CustomerPublicStoreProjection {
  const expectedSlug = canonicalPublicStoreSlug(requestedSlug);
  const root = objectValue(payload, "PUBLIC_STORE_RESPONSE_INVALID");
  assertOnlyFields(root, ROOT_FIELDS);
  const sourceStore = objectValue(root.store, "PUBLIC_STORE_INVALID");
  assertOnlyFields(sourceStore, STORE_FIELDS);
  const responseSlug = canonicalPublicStoreSlug(sourceStore.slug);
  if (responseSlug !== expectedSlug) throw new PublicStoreContractError("PUBLIC_STORE_SLUG_MISMATCH");
  const status = optionalString(sourceStore.status, 16).toLocaleLowerCase("en-US") || "open";
  if (status !== "open" && status !== "closed") {
    throw new PublicStoreContractError("PUBLIC_STORE_STATUS_INVALID");
  }
  const ratingValue = sourceStore.rating;
  const rating = ratingValue === null || ratingValue === undefined
    ? null
    : finiteNumber(ratingValue, "PUBLIC_STORE_RATING_INVALID");
  if (rating !== null && (rating < 0 || rating > 5)) {
    throw new PublicStoreContractError("PUBLIC_STORE_RATING_INVALID");
  }
  if (!Array.isArray(root.products)) throw new PublicStoreContractError("PUBLIC_STORE_PRODUCTS_INVALID");

  const store: CustomerPublicStore = Object.freeze({
    slug: responseSlug,
    name: requiredString(sourceStore.name, "PUBLIC_STORE_NAME_MISSING", 160),
    description: optionalString(sourceStore.description, 2_000),
    logoUrl: optionalAssetUrl(sourceStore.logo_url, assetOrigin, allowCleartextAssetOrigin),
    bannerUrl: optionalAssetUrl(sourceStore.banner_url, assetOrigin, allowCleartextAssetOrigin),
    status,
    rating,
    reviewCount: nonNegativeInteger(sourceStore.review_count),
    followerCount: nonNegativeInteger(sourceStore.follower_count),
    totalUnitsSold: nonNegativeInteger(sourceStore.total_units_sold),
    productCount: nonNegativeInteger(sourceStore.product_count),
    shippingSummary: optionalString(sourceStore.shipping_summary, 1_000),
    returnSummary: optionalString(sourceStore.return_summary, 1_000),
  });
  const products = root.products.map((item) => normalizeProduct(item, assetOrigin, allowCleartextAssetOrigin));
  return Object.freeze({ store, products: Object.freeze(products),
    ...(root.pagination === undefined ? {} : { pagination: normalizePublicPagination(root.pagination) }),
  });
}

function orderedMedia(product: CustomerPublicProduct): CustomerPublicProductMedia[] {
  return [...product.media].sort((left, right) =>
    Number(right.isMain) - Number(left.isMain) ||
    left.sortOrder - right.sortOrder ||
    left.id.localeCompare(right.id, "en-US"));
}

export function orderedCustomerCardMedia(
  product: CustomerPublicProduct,
): readonly CustomerProductCardMedia[] {
  const seen = new Set<string>();
  const result: CustomerProductCardMedia[] = [];
  for (const media of orderedMedia(product)) {
    if (seen.has(media.url)) continue;
    seen.add(media.url);
    result.push(Object.freeze({ id: media.id, url: media.url, cardFraming: media.cardFraming }));
  }
  if (product.imageUrl && !seen.has(product.imageUrl)) {
    result.push(Object.freeze({ id: `${product.id}-primary`, url: product.imageUrl, cardFraming: null }));
  }
  return Object.freeze(result);
}

/** PDP and viewer callers deliberately receive URLs only; card framing cannot leak. */
export function orderedCustomerOriginalMediaUrls(
  product: CustomerPublicProduct,
): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const media of orderedMedia(product)) {
    if (!seen.has(media.url)) {
      seen.add(media.url);
      result.push(media.url);
    }
  }
  if (product.imageUrl && !seen.has(product.imageUrl)) result.push(product.imageUrl);
  return Object.freeze(result);
}
