import {
  canonicalProductNumericId,
  canonicalVariantId,
  type CustomerVariantSelection,
} from "./canonicalVariant";

export type { CustomerVariantSelection } from "./canonicalVariant";

export type CustomerPurchasableVariant = Readonly<{
  id: number;
  sku: string;
  selections: readonly CustomerVariantSelection[];
  price: number;
  availableStock: number;
  purchasable: boolean;
  commerceRevision: number;
}>;

export type CustomerCanonicalProductMedia = Readonly<{
  id: string;
  url: string;
  isMain: boolean;
  sortOrder: number;
}>;

export type CustomerCanonicalProductStore = Readonly<{
  slug: string;
  name: string;
}>;

export type CustomerCanonicalProductAttribute = Readonly<{
  code: string;
  name: string;
  type: string;
  unit: string | null;
  value: unknown;
}>;

export type CustomerCanonicalProductDetail = Readonly<{
  id: number;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number;
  oldPrice: number | null;
  stock: number;
  isPurchasable: boolean;
  imageUrl: string | null;
  media: readonly CustomerCanonicalProductMedia[];
  averageRating: number;
  reviewCount: number;
  store: CustomerCanonicalProductStore | null;
  attributes: readonly CustomerCanonicalProductAttribute[];
  variantSelectionRequired: boolean;
  variants: readonly CustomerPurchasableVariant[] | null;
}>;

export class CustomerProductContractError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "CustomerProductContractError";
    this.code = code;
  }
}

function objectValue(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CustomerProductContractError(code);
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== "string") throw new CustomerProductContractError(code);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new CustomerProductContractError(code);
  }
  return normalized;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requiredText(value, "PRODUCT_TEXT_INVALID", maxLength);
}

function optionalDescription(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new CustomerProductContractError("PRODUCT_DESCRIPTION_INVALID");
  const normalized = value.trim();
  if (!normalized || normalized.length > 20_000 || /[\u0000\u000b\u000c\u000e-\u001f\u007f]/u.test(normalized)) {
    throw new CustomerProductContractError("PRODUCT_DESCRIPTION_INVALID");
  }
  return normalized;
}

function nonNegativeMoney(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CustomerProductContractError(code);
  }
  return value;
}

function nonNegativeInteger(value: unknown, code: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new CustomerProductContractError(code);
  }
  return value;
}

// PostgreSQL NUMERIC values in the legacy product projection arrive as exact
// decimal strings. Canonical variant rows remain number-only above.
function nonNegativeProjectedNumber(value: unknown, code: string): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+(?:\.\d+)?$/u.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new CustomerProductContractError(code);
  return parsed;
}

function nonNegativeProjectedInteger(value: unknown, code: string): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/u.test(value)
      ? Number(value)
      : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new CustomerProductContractError(code);
  return parsed;
}

function safeDisplayMediaUrl(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new CustomerProductContractError("PRODUCT_MEDIA_URL_INVALID");
  const candidate = value.trim();
  if (candidate.startsWith("/") && !candidate.startsWith("//")) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new CustomerProductContractError("PRODUCT_MEDIA_URL_INVALID");
    }
    return url.toString();
  } catch (error) {
    if (error instanceof CustomerProductContractError) throw error;
    throw new CustomerProductContractError("PRODUCT_MEDIA_URL_INVALID");
  }
}

function normalizeSelection(value: unknown): CustomerVariantSelection {
  const source = objectValue(value, "VARIANT_SELECTION_INVALID");
  if (Object.keys(source).some((key) => key !== "group" && key !== "value")) {
    throw new CustomerProductContractError("VARIANT_SELECTION_INVALID");
  }
  return Object.freeze({
    group: requiredText(source.group, "VARIANT_SELECTION_INVALID", 96),
    value: requiredText(source.value, "VARIANT_SELECTION_INVALID", 96),
  });
}

export function normalizeCanonicalVariantSelections(value: unknown): readonly CustomerVariantSelection[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new CustomerProductContractError("VARIANT_SELECTIONS_INVALID");
  }
  const selections = value.map(normalizeSelection);
  if (new Set(selections.map(({ group }) => group)).size !== selections.length) {
    throw new CustomerProductContractError("VARIANT_SELECTIONS_INVALID");
  }
  return Object.freeze(selections);
}

function normalizeVariant(value: unknown): CustomerPurchasableVariant {
  const source = objectValue(value, "PURCHASABLE_VARIANT_INVALID");
  const allowed = new Set(["id", "sku", "selections", "price", "availableStock", "purchasable", "commerce_revision"]);
  if (Object.keys(source).some((key) => !allowed.has(key))) {
    throw new CustomerProductContractError("PURCHASABLE_VARIANT_INVALID");
  }
  const id = canonicalVariantId(source.id);
  const commerceRevision = canonicalProductNumericId(source.commerce_revision);
  const availableStock = nonNegativeInteger(source.availableStock, "VARIANT_STOCK_INVALID");
  if (!id || !commerceRevision || typeof source.purchasable !== "boolean") {
    throw new CustomerProductContractError("PURCHASABLE_VARIANT_INVALID");
  }
  if (source.purchasable && availableStock < 1) {
    throw new CustomerProductContractError("VARIANT_PURCHASABILITY_INVALID");
  }
  return Object.freeze({
    id,
    sku: requiredText(source.sku, "VARIANT_SKU_INVALID", 160),
    selections: normalizeCanonicalVariantSelections(source.selections),
    price: nonNegativeMoney(source.price, "VARIANT_PRICE_INVALID"),
    availableStock,
    purchasable: source.purchasable,
    commerceRevision,
  });
}

function normalizeMedia(value: unknown): CustomerCanonicalProductMedia | null {
  const source = objectValue(value, "PRODUCT_MEDIA_INVALID");
  const url = safeDisplayMediaUrl(source.media_url);
  if (!url || (source.media_type !== undefined && String(source.media_type).toLowerCase() !== "image")) return null;
  const id = typeof source.id === "number" && Number.isSafeInteger(source.id) && source.id > 0
    ? String(source.id)
    : requiredText(source.id, "PRODUCT_MEDIA_ID_INVALID", 128);
  const sortOrder = source.sort_order === undefined || source.sort_order === null
    ? 0
    : nonNegativeInteger(source.sort_order, "PRODUCT_MEDIA_SORT_INVALID");
  return Object.freeze({ id, url, isMain: source.is_main === true, sortOrder });
}

function normalizeStore(value: unknown): CustomerCanonicalProductStore | null {
  if (value === null || value === undefined) return null;
  const source = objectValue(value, "PRODUCT_STORE_INVALID");
  const slug = requiredText(source.slug, "PRODUCT_STORE_INVALID", 160).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new CustomerProductContractError("PRODUCT_STORE_INVALID");
  }
  return Object.freeze({ slug, name: requiredText(source.name, "PRODUCT_STORE_INVALID", 160) });
}

function normalizeAttribute(value: unknown): CustomerCanonicalProductAttribute | null {
  const source = objectValue(value, "PRODUCT_ATTRIBUTE_INVALID");
  const code = optionalText(source.code, 96);
  const name = optionalText(source.name, 160);
  if (!code || !name) return null;
  return Object.freeze({
    code,
    name,
    type: optionalText(source.type, 48) ?? "text",
    unit: optionalText(source.unit, 48),
    value: source.value ?? null,
  });
}

export function normalizeCanonicalProductDetail(
  payload: unknown,
  expectedProductId: unknown,
): CustomerCanonicalProductDetail {
  const expectedId = canonicalProductNumericId(expectedProductId);
  const source = objectValue(payload, "PRODUCT_DETAIL_INVALID");
  const responseId = canonicalProductNumericId(source.id);
  if (!expectedId || !responseId || responseId !== expectedId) {
    throw new CustomerProductContractError("PRODUCT_DETAIL_ID_MISMATCH");
  }
  if (typeof source.variant_selection_required !== "boolean") {
    throw new CustomerProductContractError("VARIANT_REQUIRED_SIGNAL_INVALID");
  }
  const variantSelectionRequired = source.variant_selection_required;
  let variants: readonly CustomerPurchasableVariant[] | null = null;
  if (variantSelectionRequired) {
    if (!Array.isArray(source.variants)) {
      throw new CustomerProductContractError("VARIANT_LIST_MISSING");
    }
    const normalized = source.variants.map(normalizeVariant);
    if (new Set(normalized.map(({ id }) => id)).size !== normalized.length) {
      throw new CustomerProductContractError("VARIANT_ID_DUPLICATE");
    }
    variants = Object.freeze(normalized);
  } else if (source.variants !== null && source.variants !== undefined) {
    if (!Array.isArray(source.variants) || source.variants.length !== 0) {
      throw new CustomerProductContractError("SIMPLE_PRODUCT_VARIANTS_INVALID");
    }
  }

  const rawMedia = source.media ?? [];
  const rawAttributes = source.attributes ?? [];
  if (!Array.isArray(rawMedia) || !Array.isArray(rawAttributes)) {
    throw new CustomerProductContractError("PRODUCT_DETAIL_INVALID");
  }
  if (typeof source.is_purchasable !== "boolean") {
    throw new CustomerProductContractError("PRODUCT_PURCHASABILITY_INVALID");
  }
  const productPrice = nonNegativeProjectedNumber(source.price, "PRODUCT_PRICE_INVALID");
  const oldPrice = source.old_price === null || source.old_price === undefined
    ? null
    : nonNegativeProjectedNumber(source.old_price, "PRODUCT_OLD_PRICE_INVALID");
  const rating = source.average_rating === null || source.average_rating === undefined
    ? 0
    : nonNegativeProjectedNumber(source.average_rating, "PRODUCT_RATING_INVALID");

  return Object.freeze({
    id: responseId,
    slug: optionalText(source.slug, 255) ?? String(responseId),
    name: requiredText(source.name, "PRODUCT_NAME_INVALID", 255),
    description: optionalDescription(source.description),
    category: optionalText(source.category, 255),
    price: productPrice,
    oldPrice: oldPrice !== null && oldPrice > productPrice ? oldPrice : null,
    stock: nonNegativeProjectedInteger(source.stock, "PRODUCT_STOCK_INVALID"),
    isPurchasable: source.is_purchasable,
    imageUrl: safeDisplayMediaUrl(source.image_url),
    media: Object.freeze(rawMedia.map(normalizeMedia).filter((item): item is CustomerCanonicalProductMedia => item !== null)),
    averageRating: Math.min(5, rating),
    reviewCount: source.review_count === null || source.review_count === undefined
      ? 0
      : nonNegativeProjectedInteger(source.review_count, "PRODUCT_REVIEW_COUNT_INVALID"),
    store: normalizeStore(source.store),
    attributes: Object.freeze(rawAttributes.map(normalizeAttribute).filter((item): item is CustomerCanonicalProductAttribute => item !== null)),
    variantSelectionRequired,
    variants,
  });
}
