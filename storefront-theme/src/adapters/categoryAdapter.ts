import type { Category, Collection } from "../types/catalog";

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord => value && typeof value === "object" ? value as UnknownRecord : {};

function flattenCategories(value: unknown, result: UnknownRecord[] = []): UnknownRecord[] {
  for (const item of Array.isArray(value) ? value : []) {
    const category = record(item);
    result.push(category);
    flattenCategories(category.children, result);
  }
  return result;
}

export function adaptCategories(payload: unknown): Category[] {
  const envelope = record(payload);
  const source = Array.isArray(payload) ? payload : envelope.items || envelope.categories;
  return flattenCategories(source).map((raw) => ({
    id: Number(raw.id),
    name: String(raw.name || "Kategori"),
    slug: String(raw.slug || ""),
    path: String(raw.path || raw.slug || ""),
    productCount: Number(raw.subtree_visible_product_count || raw.visible_product_count || raw.product_count || 0),
  })).filter((category) => Number.isInteger(category.id) && category.id > 0 && category.slug);
}

export function adaptCollections(payload: unknown): Collection[] {
  const envelope = record(payload);
  const source = Array.isArray(payload) ? payload : envelope.items || envelope.collections;
  return (Array.isArray(source) ? source : []).map((value) => {
    const raw = record(value);
    return {
      id: Number(raw.id),
      name: String(raw.name || "Koleksiyon"),
      slug: String(raw.slug || ""),
      description: String(raw.description || ""),
    };
  }).filter((collection) => Number.isInteger(collection.id) && collection.id > 0 && collection.slug);
}
