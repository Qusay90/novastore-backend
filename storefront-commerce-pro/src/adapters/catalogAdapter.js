import productCardFraming from "../../../shared/productCardFraming.js";
import { normalizePurchasableVariants } from "./variantContract.js";

const { normalizeCardFraming } = productCardFraming;

const asArray = (value) => Array.isArray(value) ? value : [];
const asId = (value) => String(value ?? "").trim();
const finiteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const nonNegativeInteger = (value) => Math.max(0, Math.floor(finiteNumber(value, 0)));

const safeProductSlug = (value, fallback) => {
  const normalized = String(value || "").trim().toLocaleLowerCase("tr-TR");
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : String(fallback);
};

const safeMediaUrl = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("/") && !normalized.startsWith("//")) return normalized;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
};

const productMediaType = (item, url) => {
  const declared = String(item?.media_type || item?.mediaType || item?.type || "").trim().toLocaleLowerCase("en-US");
  if (declared === "video") return "video";
  return /\/video\/upload\//i.test(url) || /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(url)
    ? "video"
    : "image";
};

const safeCardFraming = (value) => {
  try { return normalizeCardFraming(value); }
  catch { return null; }
};

const safePublicStore = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const slug = String(value.slug || "").trim().toLocaleLowerCase("tr-TR");
  const name = String(value.name || "").trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && name
    ? Object.freeze({ slug, name: name.slice(0, 160) })
    : null;
};

const normalizeProductMedia = (product, fallbackImageUrl) => {
  const seen = new Set();
  const items = asArray(product?.media).map((item, index) => {
    const url = safeMediaUrl(item?.media_url || item?.mediaUrl || item?.url);
    if (!url || seen.has(url)) return null;
    seen.add(url);
    return Object.freeze({
      id: String(item?.id ?? `${product?.id || "product"}-${index}`),
      url,
      type: productMediaType(item, url),
      isMain: item?.is_main === true || item?.isMain === true,
      sortOrder: nonNegativeInteger(item?.sort_order ?? item?.sortOrder ?? index),
      cardFraming: safeCardFraming(item?.card_framing ?? item?.cardFraming),
    });
  }).filter(Boolean);

  const fallback = safeMediaUrl(fallbackImageUrl);
  if (fallback && !seen.has(fallback)) {
    items.push(Object.freeze({
      id: `${product?.id || "product"}-primary`,
      url: fallback,
      type: "image",
      isMain: items.length === 0,
      sortOrder: items.length,
      cardFraming: null,
    }));
  }

  return Object.freeze(items.sort((left, right) => (
    Number(right.isMain) - Number(left.isMain)
    || left.sortOrder - right.sortOrder
    || left.id.localeCompare(right.id)
  )));
};

const flattenCategoryTree = (tree) => {
  const flattened = [];
  const visit = (items, parentPath = "") => {
    asArray(items).forEach((item) => {
      const path = String(item.path || (parentPath ? `${parentPath}/${item.slug}` : item.slug) || "")
        .replace(/^\/+|\/+$/g, "")
        .toLocaleLowerCase("tr-TR");
      flattened.push({ ...item, path });
      visit(item.children, path);
    });
  };
  visit(tree);
  return flattened;
};

const collectNavigationCategoryOrder = (items, target = []) => {
  asArray(items).forEach((item) => {
    const categoryId = item?.target?.type === "category" ? asId(item.target.id) : "";
    if (categoryId && !target.includes(categoryId)) target.push(categoryId);
    collectNavigationCategoryOrder(item?.children, target);
  });
  return target;
};

const normalizeCategories = (tree, navigation) => {
  const flattened = flattenCategoryTree(tree);
  const navigationOrder = collectNavigationCategoryOrder(navigation?.items);
  const navigationIndex = new Map(navigationOrder.map((id, index) => [id, index]));

  return flattened.map((category, index) => {
    const id = asId(category.id);
    const parentId = category.parent_id === null || category.parent_id === undefined
      ? null
      : asId(category.parent_id);
    const menuRank = navigationIndex.has(id) ? navigationIndex.get(id) : null;
    return Object.freeze({
      id,
      name: String(category.name || "").trim(),
      slug: String(category.slug || "").trim().toLocaleLowerCase("tr-TR"),
      parentId,
      path: String(category.path || "").trim().toLocaleLowerCase("tr-TR"),
      canonicalPath: String(category.path || "").trim().toLocaleLowerCase("tr-TR"),
      depth: Number(category.depth ?? 0),
      sortOrder: menuRank === null ? 10_000 + Number(category.sort_order || index) : menuRank,
      active: true,
      customerVisible: true,
      archived: false,
      imageUrl: safeMediaUrl(category.image_url),
      bannerUrl: safeMediaUrl(category.banner_url),
      accentColor: /^#[0-9a-f]{6}$/i.test(String(category.accent_color || ""))
        ? category.accent_color
        : null,
      seoDescription: String(category.seo_description || category.description || "").trim(),
      serverVisibleProductCount: Number(category.subtree_visible_product_count || 0),
      serverSellableProductCount: Number(category.subtree_sellable_product_count || 0),
    });
  });
};

const formatAttributeValue = (attribute) => {
  const raw = attribute?.value ?? attribute?.displayValue ?? attribute?.display_value;
  const unit = String(attribute?.unit || "").trim();
  if (raw === null || raw === undefined || raw === "") return "";
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item?.label ?? item?.value ?? item ?? "").trim()).filter(Boolean).join(", ");
  }
  if (typeof raw === "object") {
    if (raw.label || raw.value) return String(raw.label || raw.value).trim();
    if (raw.min !== undefined || raw.max !== undefined) {
      const range = [raw.min, raw.max].filter((value) => value !== null && value !== undefined).join("–");
      return `${range}${unit ? ` ${unit}` : ""}`.trim();
    }
    return "";
  }
  if (typeof raw === "boolean") return raw ? "Evet" : "Hayır";
  return `${raw}${unit ? ` ${unit}` : ""}`.trim();
};

const normalizeAttributeFeatures = (attributes) => asArray(attributes)
  .map((attribute) => {
    const label = String(attribute?.label || attribute?.name || "").trim();
    const value = formatAttributeValue(attribute);
    if (!label || !value) return null;
    return `${label}: ${value}`;
  })
  .filter(Boolean)
  .slice(0, 8);

const attributeValueByCode = (attributes, codes) => {
  const accepted = new Set(codes);
  const attribute = asArray(attributes).find((item) => accepted.has(
    String(item?.code || "").trim().toLocaleLowerCase("tr-TR"),
  ));
  return formatAttributeValue(attribute) || null;
};

const buildLegacyCategoryNameIndex = (categories) => {
  const grouped = new Map();
  categories.forEach((category) => {
    const key = category.name.toLocaleLowerCase("tr-TR");
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(category.id);
  });
  return grouped;
};

const normalizeProducts = (payload, categories, collectionDetails) => {
  const categoryIds = new Set(categories.map((category) => category.id));
  const categoryNames = buildLegacyCategoryNameIndex(categories);
  const collectionSlugsByProduct = new Map();
  const featuredRankByProduct = new Map();

  collectionDetails.forEach((detail, collectionIndex) => {
    const slug = String(detail?.collection?.slug || "").trim();
    asArray(detail?.products).forEach((product, productIndex) => {
      const id = Number(product.id);
      if (!Number.isInteger(id)) return;
      if (!collectionSlugsByProduct.has(id)) collectionSlugsByProduct.set(id, []);
      if (slug && !collectionSlugsByProduct.get(id).includes(slug)) {
        collectionSlugsByProduct.get(id).push(slug);
      }
      if (!featuredRankByProduct.has(id)) {
        featuredRankByProduct.set(id, collectionIndex * 100 + productIndex);
      }
    });
  });

  return asArray(payload).map((product, index) => {
    if (product.variant_selection_required !== undefined && typeof product.variant_selection_required !== "boolean") return null;
    const id = Number(product.id);
    if (!Number.isInteger(id) || id <= 0) return null;
    const name = String(product.name || "").trim();
    if (!name) return null;
    let linkedCategoryIds = [...new Set(
      asArray(product.categoryIds || product.category_ids).map(asId).filter((value) => categoryIds.has(value)),
    )];

    if (linkedCategoryIds.length === 0) {
      const legacyNames = asArray(product.categories).length
        ? product.categories
        : [product.category];
      const legacyMatches = legacyNames.flatMap((name) => {
        const matches = categoryNames.get(String(name || "").trim().toLocaleLowerCase("tr-TR")) || [];
        return matches.length === 1 ? matches : [];
      });
      linkedCategoryIds = [...new Set(legacyMatches)];
    }

    const primaryCandidate = asId(product.primaryCategoryId || product.primary_category_id);
    const primaryCategoryId = linkedCategoryIds.includes(primaryCandidate)
      ? primaryCandidate
      : linkedCategoryIds[0] || null;
    const stock = nonNegativeInteger(product.stock);
    const price = finiteNumber(product.price, 0);
    const oldPrice = product.old_price === null || product.old_price === undefined
      ? null
      : Number(product.old_price);
    const rawMedia = asArray(product.media);
    const attributes = asArray(product.attributes);
    const fallbackImageUrl = safeMediaUrl(
      product.image_url
      || product.imageUrl
      || rawMedia.find((item) => item.is_main === true)?.media_url
      || rawMedia[0]?.media_url,
    );
    const media = normalizeProductMedia(product, fallbackImageUrl);
    const imageUrl = media.find((item) => item.type === "image" && item.isMain)?.url
      || media.find((item) => item.type === "image")?.url
      || null;
    const discount = oldPrice && oldPrice > price
      ? Math.round((1 - price / oldPrice) * 100)
      : 0;

    return Object.freeze({
      id,
      slug: safeProductSlug(product.slug, id),
      name,
      categoryId: primaryCategoryId,
      categoryIds: Object.freeze(linkedCategoryIds),
      brand: String(product.brand || attributeValueByCode(attributes, ["marka", "brand"]) || "").trim(),
      price: Number.isFinite(price) && price >= 0 ? price : 0,
      oldPrice: Number.isFinite(oldPrice) && oldPrice > price ? oldPrice : null,
      rating: Math.min(5, Math.max(0, finiteNumber(product.average_rating ?? product.rating, 0))),
      reviews: nonNegativeInteger(product.review_count ?? product.reviews),
      stock,
      variantSelectionRequired: product.variant_selection_required === true,
      variantContractLoaded: typeof product.variant_selection_required === "boolean",
      variants: normalizePurchasableVariants(product.variants),
      fastDelivery: false,
      deliveryLabel: null,
      color: product.color || attributeValueByCode(attributes, ["renk", "color"]) || null,
      storage: product.storage || attributeValueByCode(attributes, ["kapasite", "depolama", "storage"]) || null,
      badge: stock <= 0 ? "Tükendi" : discount > 0 ? `%${discount} İndirim` : "",
      imageUrl,
      media,
      store: safePublicStore(product.store),
      imageKey: null,
      description: String(product.description || "").trim(),
      features: Object.freeze(normalizeAttributeFeatures(attributes)),
      featuredRank: featuredRankByProduct.get(id) ?? 1_000 + index,
      collectionSlugs: Object.freeze(collectionSlugsByProduct.get(id) || []),
      active: true,
      customerVisible: true,
      deletedAt: null,
    });
  }).filter(Boolean);
};

const categoryNavigationFallback = (tree) => ({
  code: "main",
  name: "Kategori ağı",
  source: "public-categories",
  items: asArray(tree).map((category) => ({
    id: `category-${category.id}`,
    title: category.name,
    target: {
      type: "category",
      id: category.id,
      slug: category.slug,
      path: category.path,
      url: `/kategori/${category.path || category.slug}`,
    },
    children: categoryNavigationFallback(category.children).items,
  })),
});

export function createCatalogAdapter(http) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("Catalog adapter için storefront HTTP istemcisi gereklidir.");
  }

  const load = async ({ signal } = {}) => {
    const optionalWarnings = [];
    const [categoryTree, productPayload, collectionsResult] = await Promise.all([
      http.request("/api/public/categories?format=tree", { signal }),
      http.request("/api/products", { signal }),
      http.request("/api/public/collections", { signal })
        .then((value) => ({ status: "fulfilled", value }))
        .catch((reason) => ({ status: "rejected", reason })),
    ]);
    if (collectionsResult.status === "rejected" && collectionsResult.reason?.code === "STOREFRONT_ABORTED") {
      throw collectionsResult.reason;
    }
    const collections = collectionsResult.status === "fulfilled" ? collectionsResult.value : [];
    if (collectionsResult.status === "rejected") {
      optionalWarnings.push("Ana sayfa koleksiyonları şu anda alınamıyor.");
    }

    let navigation;
    try {
      navigation = await http.request("/api/public/navigation/main", { signal });
      navigation = { ...navigation, source: "public-navigation" };
    } catch (error) {
      if (error?.status !== 404) throw error;
      navigation = categoryNavigationFallback(categoryTree);
    }

    const homeCollections = asArray(collections)
      .filter((collection) => collection.show_on_home === true)
      .slice(0, 4);
    const collectionDetailResults = await Promise.allSettled(homeCollections.map((collection) => (
      http.request(`/api/public/collections/${encodeURIComponent(collection.slug)}?page=1&limit=8`, { signal })
    )));
    const abortedDetail = collectionDetailResults.find((result) => (
      result.status === "rejected" && result.reason?.code === "STOREFRONT_ABORTED"
    ));
    if (abortedDetail) throw abortedDetail.reason;
    const collectionDetails = collectionDetailResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (collectionDetailResults.some((result) => result.status === "rejected")) {
      optionalWarnings.push("Bazı ana sayfa koleksiyon ayrıntıları şu anda alınamıyor.");
    }
    const categories = normalizeCategories(categoryTree, navigation);
    const products = normalizeProducts(productPayload, categories, collectionDetails);

    return Object.freeze({
      categories: Object.freeze(categories),
      products: Object.freeze(products),
      navigation: Object.freeze(navigation),
      collections: Object.freeze(asArray(collections)),
      collectionDetails: Object.freeze(collectionDetails),
      warnings: Object.freeze(optionalWarnings),
    });
  };

  const loadProduct = async (productId, { catalog, signal } = {}) => {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) throw new TypeError("Geçerli bir ürün kimliği gereklidir.");
    if (!catalog || !Array.isArray(catalog.categories) || !Array.isArray(catalog.products)) {
      throw new TypeError("Ürün detayı için yüklenmiş katalog bağlamı gereklidir.");
    }
    const payload = await http.request(`/api/products/${id}`, { signal });
    const detail = normalizeProducts(
      [payload],
      catalog.categories,
      catalog.collectionDetails || [],
    )[0];
    if (!detail || detail.id !== id) throw new Error("Public ürün detayı geçerli bir ürüne dönüştürülemedi.");
    const summary = catalog.products.find((product) => Number(product.id) === id);
    return Object.freeze({
      ...(summary || {}),
      ...detail,
      rating: payload.average_rating === undefined && payload.rating === undefined
        ? summary?.rating ?? detail.rating
        : detail.rating,
      reviews: payload.review_count === undefined && payload.reviews === undefined
        ? summary?.reviews ?? detail.reviews
        : detail.reviews,
      featuredRank: summary?.featuredRank ?? detail.featuredRank,
      collectionSlugs: summary?.collectionSlugs || detail.collectionSlugs,
    });
  };

  const loadCollection = async (collectionSlug, { catalog, signal } = {}) => {
    const slug = String(collectionSlug || "").trim().toLocaleLowerCase("tr-TR");
    if (!slug || /[/?#\\\u0000-\u001f\u007f]/.test(slug)) {
      throw new TypeError("Geçerli bir koleksiyon slug değeri gereklidir.");
    }
    if (!catalog || !Array.isArray(catalog.products)) {
      throw new TypeError("Koleksiyon için yüklenmiş katalog bağlamı gereklidir.");
    }
    const payload = await http.request(
      `/api/public/collections/${encodeURIComponent(slug)}?page=1&limit=100`,
      { signal },
    );
    const summaries = new Map(catalog.products.map((product) => [Number(product.id), product]));
    const products = asArray(payload?.products).map((entry) => {
      const summary = summaries.get(Number(entry.id));
      if (!summary) return null;
      const price = Number(entry.price);
      const oldPrice = entry.old_price === null || entry.old_price === undefined
        ? summary.oldPrice
        : Number(entry.old_price);
      const resolvedPrice = Number.isFinite(price) && price >= 0 ? price : summary.price;
      const resolvedOldPrice = Number.isFinite(oldPrice) && oldPrice > resolvedPrice
        ? oldPrice
        : summary.oldPrice;
      const stock = nonNegativeInteger(entry.stock ?? summary.stock);
      const collectionSlugs = [...new Set([...(summary.collectionSlugs || []), slug])];
      return Object.freeze({
        ...summary,
        name: String(entry.name || summary.name).trim(),
        description: String(entry.description || summary.description || "").trim(),
        price: resolvedPrice,
        oldPrice: resolvedOldPrice,
        stock,
        imageUrl: safeMediaUrl(entry.image_url) || summary.imageUrl,
        badge: stock <= 0 ? "Tükendi" : resolvedOldPrice && resolvedOldPrice > resolvedPrice
          ? `%${Math.round((1 - resolvedPrice / resolvedOldPrice) * 100)} İndirim`
          : summary.badge,
        collectionSlugs: Object.freeze(collectionSlugs),
      });
    }).filter(Boolean);
    return Object.freeze({
      collection: Object.freeze({ ...(payload?.collection || {}), slug }),
      products: Object.freeze(products),
      pagination: Object.freeze({ ...(payload?.pagination || {}) }),
    });
  };

  return Object.freeze({ load, loadProduct, loadCollection });
}

export const catalogAdapterTestUtils = Object.freeze({
  safeMediaUrl,
  flattenCategoryTree,
  collectNavigationCategoryOrder,
  normalizeCategories,
  normalizeProducts,
  normalizeProductMedia,
  safeCardFraming,
  safePublicStore,
  formatAttributeValue,
  attributeValueByCode,
  categoryNavigationFallback,
  safeProductSlug,
});
