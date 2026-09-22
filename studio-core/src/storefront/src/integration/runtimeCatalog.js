export let categories = Object.freeze([]);
export let products = Object.freeze([]);

let categoryById = new Map();
let categoryByPath = new Map();

const asId = (value) => String(value ?? "").trim();
const asProductId = (value) => {
  if (Number.isInteger(value) && value > 0) return value;
  const text = String(value ?? "").trim();
  return /^[A-Z0-9][A-Z0-9_-]{0,63}$/i.test(text) ? text : null;
};
const finiteNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const nonNegativeInteger = (value) => Math.max(0, Math.floor(finiteNumber(value, 0)));

const freezeRecord = (value) => Object.freeze({ ...value });

export function configureRuntimeCatalog({ categories: nextCategories, products: nextProducts }) {
  const normalizedCategories = (Array.isArray(nextCategories) ? nextCategories : [])
    .filter((category) => category && asId(category.id) && category.name && category.path)
    .map((category) => freezeRecord({
      ...category,
      id: asId(category.id),
      parentId: category.parentId === null || category.parentId === undefined
        ? null
        : asId(category.parentId),
      slug: String(category.slug || "").trim(),
      path: String(category.path || "").trim(),
      canonicalPath: String(category.canonicalPath || category.path || "").trim(),
      sortOrder: Number(category.sortOrder || 0),
      active: category.active !== false,
      customerVisible: category.customerVisible !== false,
      archived: category.archived === true,
    }));

  const validCategoryIds = new Set(normalizedCategories.map((category) => category.id));
  const normalizedProducts = (Array.isArray(nextProducts) ? nextProducts : [])
    .filter((product) => product && asProductId(product.id) !== null)
    .map((product) => {
      const id = asProductId(product.id);
      const categoryIds = [...new Set(
        (Array.isArray(product.categoryIds) ? product.categoryIds : [product.categoryId])
          .map(asId)
          .filter((id) => validCategoryIds.has(id)),
      )];
      const categoryId = validCategoryIds.has(asId(product.categoryId))
        ? asId(product.categoryId)
        : categoryIds[0] || null;
      const price = Math.max(0, finiteNumber(product.price, 0));
      const oldPrice = product.oldPrice === null || product.oldPrice === undefined
        ? null
        : finiteNumber(product.oldPrice, 0);
      return freezeRecord({
        ...product,
        id,
        categoryId,
        categoryIds: Object.freeze(categoryIds),
        price,
        oldPrice: oldPrice !== null && oldPrice > price ? oldPrice : null,
        rating: Math.min(5, Math.max(0, finiteNumber(product.rating, 0))),
        reviews: nonNegativeInteger(product.reviews),
        stock: nonNegativeInteger(product.stock),
        active: product.active !== false,
        customerVisible: product.customerVisible !== false,
        deletedAt: product.deletedAt || null,
        features: Object.freeze(Array.isArray(product.features) ? product.features.filter(Boolean) : []),
        collectionSlugs: Object.freeze(
          Array.isArray(product.collectionSlugs) ? product.collectionSlugs.filter(Boolean) : [],
        ),
      });
    });

  categories = Object.freeze(normalizedCategories);
  products = Object.freeze(normalizedProducts);
  categoryById = new Map(categories.map((category) => [category.id, category]));
  categoryByPath = new Map(categories.map((category) => [category.path, category]));

  return Object.freeze({ categories, products });
}

const compareCategoryOrder = (left, right) =>
  Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
  || String(left.name || "").localeCompare(String(right.name || ""), "tr");

const isStructurallyPublicCategory = (category) => {
  if (!category || !category.active || !category.customerVisible || category.archived) return false;

  let current = category;
  const visited = new Set();
  while (current.parentId) {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    current = categoryById.get(current.parentId);
    if (!current || !current.active || !current.customerVisible || current.archived) return false;
  }
  return true;
};

const isPublicProduct = (item) => {
  if (!item || !item.active || !item.customerVisible || item.deletedAt) return false;
  return (item.categoryIds || []).some((id) => isStructurallyPublicCategory(categoryById.get(id)));
};

const publicProducts = () => products.filter(isPublicProduct);

const productBelongsToBranch = (item, category) => (item.categoryIds || []).some((id) => {
  const assignedCategory = categoryById.get(id);
  return Boolean(
    assignedCategory
    && (assignedCategory.path === category.path || assignedCategory.path.startsWith(`${category.path}/`)),
  );
});

const countForCategory = (category) => {
  const matchingProducts = publicProducts().filter((item) => productBelongsToBranch(item, category));
  return {
    visibleProductCount: matchingProducts.length,
    sellableProductCount: matchingProducts.filter((item) => item.stock > 0).length,
  };
};

const decorateCategory = (category) => {
  if (!category) return null;
  const counts = countForCategory(category);
  const visibleChildCount = categories.filter((candidate) => (
    candidate.parentId === category.id
    && isStructurallyPublicCategory(candidate)
    && countForCategory(candidate).visibleProductCount > 0
  )).length;

  return Object.freeze({
    ...category,
    ...counts,
    descendantVisibleProductCount: counts.visibleProductCount,
    visibleChildCount,
  });
};

const isPubliclyPopulatedCategory = (category) =>
  isStructurallyPublicCategory(category) && countForCategory(category).visibleProductCount > 0;

export function getVisibleRoots() {
  return categories
    .filter((category) => category.parentId === null && isPubliclyPopulatedCategory(category))
    .sort(compareCategoryOrder)
    .map(decorateCategory);
}

export function getVisibleChildren(parentId) {
  const normalizedParentId = asId(parentId);
  if (!categoryById.has(normalizedParentId)) return [];
  return categories
    .filter((category) => category.parentId === normalizedParentId && isPubliclyPopulatedCategory(category))
    .sort(compareCategoryOrder)
    .map(decorateCategory);
}

export function getCategoryById(id) {
  return categoryById.get(asId(id)) ?? null;
}

const normalizePublicPath = (input) => {
  if (typeof input !== "string") return null;
  let value = input.trim();
  if (!value || value.length > 512) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  value = value.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
  if (!value) return null;
  const rawSegments = value.split("/");
  if (rawSegments.some((segment) => segment.length === 0)) return null;
  if (rawSegments[0].toLocaleLowerCase("tr-TR") === "kategori") rawSegments.shift();
  if (!rawSegments.length) return null;

  const normalizedSegments = [];
  for (const rawSegment of rawSegments) {
    let segment;
    try {
      segment = decodeURIComponent(rawSegment).normalize("NFC").toLocaleLowerCase("tr-TR");
    } catch {
      return null;
    }
    if (
      !segment
      || segment === "."
      || segment === ".."
      || segment.length > 80
      || segment.includes("/")
      || segment.includes("\\")
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)
    ) return null;
    normalizedSegments.push(segment);
  }
  return normalizedSegments.join("/");
};

export function resolveCategoryPath(path) {
  const normalizedPath = normalizePublicPath(path);
  if (!normalizedPath) return null;
  const category = categoryByPath.get(normalizedPath);
  return isPubliclyPopulatedCategory(category) ? decorateCategory(category) : null;
}

export function getBreadcrumb(categoryId) {
  let current = categoryById.get(asId(categoryId));
  if (!isPubliclyPopulatedCategory(current)) return [];
  const breadcrumb = [];
  const visited = new Set();
  while (current) {
    if (visited.has(current.id) || !isPubliclyPopulatedCategory(current)) return [];
    visited.add(current.id);
    breadcrumb.unshift(decorateCategory(current));
    current = current.parentId ? categoryById.get(current.parentId) : null;
  }
  return breadcrumb;
}

export function getProductsForCategory(categoryId) {
  const category = categoryById.get(asId(categoryId));
  if (!isPubliclyPopulatedCategory(category)) return [];
  return stockFirst(publicProducts().filter((item) => productBelongsToBranch(item, category)));
}

export function getVisibleProducts() {
  return stockFirst(publicProducts());
}

export function stockFirst(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      Number(Number(left.item?.stock) <= 0) - Number(Number(right.item?.stock) <= 0)
      || left.index - right.index
    ))
    .map(({ item }) => item);
}

export function sortProducts(items, sort = "featured") {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const comparators = {
    featured: (left, right) => Number(left.featuredRank ?? 9999) - Number(right.featuredRank ?? 9999),
    "price-low": (left, right) => Number(left.price) - Number(right.price),
    "price-high": (left, right) => Number(right.price) - Number(left.price),
    rating: (left, right) => Number(right.rating) - Number(left.rating),
    new: (left, right) => Number(right.id) - Number(left.id),
  };
  const compare = comparators[sort] || comparators.featured;
  return safeItems
    .map((item, index) => ({ item, index }))
    .sort((left, right) => (
      Number(Number(left.item.stock) <= 0) - Number(Number(right.item.stock) <= 0)
      || compare(left.item, right.item)
      || left.index - right.index
    ))
    .map(({ item }) => item);
}

const countFacetValues = (items, selector) => {
  const counts = new Map();
  for (const item of items) {
    const value = selector(item);
    if (value === null || value === undefined || value === "") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => Object.freeze({ value, count }))
    .sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value), "tr"));
};

export function buildFacets(items) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const prices = safeItems.map((item) => Number(item.price)).filter((price) => Number.isFinite(price) && price >= 0);
  return Object.freeze({
    brands: Object.freeze(countFacetValues(safeItems, (item) => item.brand)),
    colors: Object.freeze(countFacetValues(safeItems, (item) => item.color)),
    storage: Object.freeze(countFacetValues(safeItems, (item) => item.storage)),
    fastDelivery: Object.freeze([
      Object.freeze({ value: true, count: safeItems.filter((item) => item.fastDelivery).length }),
      Object.freeze({ value: false, count: safeItems.filter((item) => !item.fastDelivery).length }),
    ]),
    availability: Object.freeze([
      Object.freeze({ value: "in-stock", count: safeItems.filter((item) => item.stock > 0).length }),
      Object.freeze({ value: "sold-out", count: safeItems.filter((item) => item.stock <= 0).length }),
    ]),
    rating: Object.freeze([
      Object.freeze({ value: 4.8, count: safeItems.filter((item) => item.rating >= 4.8).length }),
      Object.freeze({ value: 4.5, count: safeItems.filter((item) => item.rating >= 4.5).length }),
      Object.freeze({ value: 4, count: safeItems.filter((item) => item.rating >= 4).length }),
    ]),
    price: Object.freeze({
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    }),
    total: safeItems.length,
  });
}

export function getRuntimeCatalogSnapshot() {
  return Object.freeze({ categories, products });
}
