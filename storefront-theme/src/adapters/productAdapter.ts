import type { Product, ProductAttribute, ProductMedia } from "../types/catalog";

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord => (
  value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {}
);

const number = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const text = (value: unknown): string => String(value ?? "").trim();

function normalizeMedia(value: unknown, productName: string): ProductMedia[] {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const media = record(entry);
    const url = text(media.media_url || media.url);
    return {
      id: Number.isInteger(Number(media.id)) ? Number(media.id) : null,
      url,
      altText: text(media.alt_text) || `${productName} görsel ${index + 1}`,
      isVideo: text(media.media_type).toLowerCase() === "video" || /\.(mp4|webm|ogg)(?:$|[?#])/i.test(url),
    };
  }).filter((media) => media.url);
}

function normalizeAttributes(value: unknown): ProductAttribute[] {
  return (Array.isArray(value) ? value : []).map((entry) => {
    const attribute = record(entry);
    return {
      code: text(attribute.code || attribute.attribute_code),
      name: text(attribute.name || attribute.attribute_name || attribute.code),
      value: attribute.value,
      unit: text(attribute.unit) || null,
    };
  }).filter((attribute) => attribute.code || attribute.name);
}

export function adaptProduct(value: unknown): Product {
  const raw = record(value);
  const id = Number(raw.id);
  if (!Number.isInteger(id) || id < 1) throw new TypeError("NovaStore ürünü geçerli bir id içermiyor.");
  const name = text(raw.name) || `Ürün #${id}`;
  const categories = (Array.isArray(raw.categories) ? raw.categories : [raw.category])
    .map((category) => typeof category === "object" ? text(record(category).name) : text(category))
    .filter(Boolean);
  const media = normalizeMedia(raw.media || raw.media_items || raw.product_media, name);
  const imageUrl = text(raw.image_url) || media[0]?.url || "";
  const stock = Math.max(0, Math.trunc(number(raw.stock)));
  const publicationStatus = text(raw.publication_status);
  const customerVisible = raw.is_customer_visible !== false;
  const deleted = Boolean(raw.deleted_at);
  const backendPurchasable = typeof raw.is_purchasable === "boolean" ? raw.is_purchasable : null;

  return {
    id,
    name,
    description: text(raw.description),
    price: Math.max(0, number(raw.price)),
    oldPrice: raw.old_price === null || raw.old_price === undefined ? null : Math.max(0, number(raw.old_price)),
    stock,
    imageUrl,
    categories,
    category: categories[0] || text(raw.category) || "Kategorisiz",
    rating: Math.max(0, number(raw.average_rating || raw.rating)),
    reviewCount: Math.max(0, Math.trunc(number(raw.review_count))),
    purchasable: backendPurchasable ?? (publicationStatus === "active" && customerVisible && !deleted && stock > 0),
    media,
    attributes: normalizeAttributes(raw.attributes),
  };
}

export function adaptProductList(payload: unknown): Product[] {
  const source = Array.isArray(payload) ? payload : record(payload).items;
  return (Array.isArray(source) ? source : []).map(adaptProduct);
}
