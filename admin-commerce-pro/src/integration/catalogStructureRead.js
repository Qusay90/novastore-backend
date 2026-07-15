const ATTRIBUTE_TYPES = new Set(["text", "number", "boolean", "option", "multi_option", "range"]);
const COLLECTION_TYPES = new Set(["manual", "dynamic"]);
const COLLECTION_RULES = new Set(["new_arrivals", "discount", "best_sellers"]);
const MENU_CODES = new Set(["main", "footer", "mobile", "home"]);
const MENU_TARGET_TYPES = new Set(["category", "collection", "internal_url"]);

const requiredFields = (row, fields, label) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError(`${label} nesne olmalıdır.`);
  if (fields.some((field) => !Object.prototype.hasOwnProperty.call(row, field))) {
    throw new TypeError(`${label} eksik alan içeriyor.`);
  }
};

const positiveInteger = (value, field) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new TypeError(`${field} pozitif tam sayı olmalıdır.`);
  return parsed;
};

const nonnegativeInteger = (value, field) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new TypeError(`${field} negatif olmayan tam sayı olmalıdır.`);
  return parsed;
};

const integer = (value, field) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new TypeError(`${field} tam sayı olmalıdır.`);
  return parsed;
};

const boolean = (value, field) => {
  if (typeof value !== "boolean") throw new TypeError(`${field} boolean olmalıdır.`);
  return value;
};

const requiredText = (value, field) => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${field} boş olmayan metin olmalıdır.`);
  return value.trim();
};

const nullableText = (value, field) => (value === null ? null : requiredText(value, field));
const nullablePositiveInteger = (value, field) => (value === null ? null : positiveInteger(value, field));
const nullableNonnegativeInteger = (value, field) => (value === null ? null : nonnegativeInteger(value, field));

const nullableDate = (value, field) => {
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${field} geçerli tarih olmalıdır.`);
  return parsed;
};

const normalizePage = (payload, itemNormalizer, label) => {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items)) {
    throw new TypeError(`${label} items dizisi içermelidir.`);
  }
  const limit = positiveInteger(payload.limit, `${label}.limit`);
  if (limit > 100) throw new TypeError(`${label}.limit 1–100 aralığında olmalıdır.`);
  if (typeof payload.hasMore !== "boolean") throw new TypeError(`${label}.hasMore boolean olmalıdır.`);
  return Object.freeze({
    items: Object.freeze(payload.items.map(itemNormalizer)),
    limit,
    hasMore: payload.hasMore,
  });
};

const normalizeCategory = (row) => {
  requiredFields(row, [
    "id", "name", "slug", "path", "depth", "parent_id", "sort_order", "is_active",
    "is_customer_visible", "show_in_menu", "show_on_home", "hide_when_empty", "deleted_at",
    "revision", "child_count", "first_party_product_count", "attribute_template_count",
  ], "catalogStructure.category");
  const parentId = nullablePositiveInteger(row.parent_id, "category.parent_id");
  const depth = nullableNonnegativeInteger(row.depth, "category.depth");
  if (parentId !== null && depth === 0) throw new TypeError("Alt kategori depth değeri sıfır olamaz.");
  return Object.freeze({
    id: positiveInteger(row.id, "category.id"),
    name: requiredText(row.name, "category.name"),
    slug: nullableText(row.slug, "category.slug"),
    path: nullableText(row.path, "category.path"),
    depth,
    parentId,
    sortOrder: integer(row.sort_order, "category.sort_order"),
    active: boolean(row.is_active, "category.is_active"),
    customerVisible: boolean(row.is_customer_visible, "category.is_customer_visible"),
    showInMenu: boolean(row.show_in_menu, "category.show_in_menu"),
    showOnHome: boolean(row.show_on_home, "category.show_on_home"),
    hideWhenEmpty: boolean(row.hide_when_empty, "category.hide_when_empty"),
    deletedAt: nullableDate(row.deleted_at, "category.deleted_at"),
    revision: positiveInteger(row.revision, "category.revision"),
    childCount: nonnegativeInteger(row.child_count, "category.child_count"),
    firstPartyProductCount: nonnegativeInteger(row.first_party_product_count, "category.first_party_product_count"),
    attributeTemplateCount: nonnegativeInteger(row.attribute_template_count, "category.attribute_template_count"),
  });
};

const normalizeAttributeDefinition = (row) => {
  requiredFields(row, [
    "id", "code", "name", "type", "unit", "is_filterable", "is_required", "is_variant_relevant",
    "sort_order", "is_active", "revision", "option_count", "template_count", "first_party_value_count",
  ], "catalogStructure.attributeDefinition");
  const type = requiredText(row.type, "attribute.type");
  if (!ATTRIBUTE_TYPES.has(type)) throw new TypeError("attribute.type desteklenen tür olmalıdır.");
  return Object.freeze({
    id: positiveInteger(row.id, "attribute.id"),
    code: requiredText(row.code, "attribute.code"),
    name: requiredText(row.name, "attribute.name"),
    type,
    unit: nullableText(row.unit, "attribute.unit"),
    filterable: boolean(row.is_filterable, "attribute.is_filterable"),
    required: boolean(row.is_required, "attribute.is_required"),
    variantRelevant: boolean(row.is_variant_relevant, "attribute.is_variant_relevant"),
    sortOrder: integer(row.sort_order, "attribute.sort_order"),
    active: boolean(row.is_active, "attribute.is_active"),
    revision: positiveInteger(row.revision, "attribute.revision"),
    optionCount: nonnegativeInteger(row.option_count, "attribute.option_count"),
    templateCount: nonnegativeInteger(row.template_count, "attribute.template_count"),
    firstPartyValueCount: nonnegativeInteger(row.first_party_value_count, "attribute.first_party_value_count"),
  });
};

const normalizeAttributeTemplate = (row) => {
  requiredFields(row, [
    "id", "name", "category_id", "category_name", "category_path", "sort_order", "is_active",
    "revision", "attribute_count", "required_count", "filterable_count",
  ], "catalogStructure.attributeTemplate");
  const attributeCount = nonnegativeInteger(row.attribute_count, "template.attribute_count");
  const requiredCount = nonnegativeInteger(row.required_count, "template.required_count");
  const filterableCount = nonnegativeInteger(row.filterable_count, "template.filterable_count");
  if (requiredCount > attributeCount || filterableCount > attributeCount) {
    throw new TypeError("Template sayaçları attribute_count değerini aşamaz.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "template.id"),
    name: requiredText(row.name, "template.name"),
    categoryId: positiveInteger(row.category_id, "template.category_id"),
    categoryName: requiredText(row.category_name, "template.category_name"),
    categoryPath: nullableText(row.category_path, "template.category_path"),
    sortOrder: integer(row.sort_order, "template.sort_order"),
    active: boolean(row.is_active, "template.is_active"),
    revision: positiveInteger(row.revision, "template.revision"),
    attributeCount,
    requiredCount,
    filterableCount,
  });
};

const normalizeCollection = (row) => {
  requiredFields(row, [
    "id", "name", "slug", "collection_type", "rule_code", "sort_order", "is_active", "show_on_home",
    "deleted_at", "revision", "rule_count", "first_party_manual_product_count",
  ], "catalogStructure.collection");
  const type = requiredText(row.collection_type, "collection.collection_type");
  const ruleCode = nullableText(row.rule_code, "collection.rule_code");
  if (!COLLECTION_TYPES.has(type)) throw new TypeError("collection.collection_type desteklenen tür olmalıdır.");
  if ((type === "manual" && ruleCode !== null) || (type === "dynamic" && !COLLECTION_RULES.has(ruleCode))) {
    throw new TypeError("collection rule_code ve collection_type tutarsız.");
  }
  return Object.freeze({
    id: positiveInteger(row.id, "collection.id"),
    name: requiredText(row.name, "collection.name"),
    slug: requiredText(row.slug, "collection.slug"),
    type,
    ruleCode,
    sortOrder: integer(row.sort_order, "collection.sort_order"),
    active: boolean(row.is_active, "collection.is_active"),
    showOnHome: boolean(row.show_on_home, "collection.show_on_home"),
    deletedAt: nullableDate(row.deleted_at, "collection.deleted_at"),
    revision: positiveInteger(row.revision, "collection.revision"),
    ruleCount: nonnegativeInteger(row.rule_count, "collection.rule_count"),
    firstPartyManualProductCount: nonnegativeInteger(row.first_party_manual_product_count, "collection.first_party_manual_product_count"),
  });
};

const normalizeMenu = (row) => {
  requiredFields(row, [
    "id", "code", "name", "is_active", "revision", "item_count", "active_item_count", "root_item_count",
  ], "catalogStructure.menu");
  const code = requiredText(row.code, "menu.code");
  if (!MENU_CODES.has(code)) throw new TypeError("menu.code desteklenen kod olmalıdır.");
  const itemCount = nonnegativeInteger(row.item_count, "menu.item_count");
  const activeItemCount = nonnegativeInteger(row.active_item_count, "menu.active_item_count");
  const rootItemCount = nonnegativeInteger(row.root_item_count, "menu.root_item_count");
  if (activeItemCount > itemCount || rootItemCount > itemCount) throw new TypeError("Menü sayaçları item_count değerini aşamaz.");
  return Object.freeze({
    id: positiveInteger(row.id, "menu.id"),
    code,
    name: requiredText(row.name, "menu.name"),
    active: boolean(row.is_active, "menu.is_active"),
    revision: positiveInteger(row.revision, "menu.revision"),
    itemCount,
    activeItemCount,
    rootItemCount,
  });
};

const normalizeMenuItem = (row) => {
  requiredFields(row, [
    "id", "menu_id", "menu_code", "parent_id", "title", "target_type", "category_id",
    "collection_id", "has_internal_url", "sort_order", "is_active", "revision",
  ], "catalogStructure.menuItem");
  const menuCode = requiredText(row.menu_code, "menuItem.menu_code");
  if (!MENU_CODES.has(menuCode)) throw new TypeError("menuItem.menu_code desteklenen kod olmalıdır.");
  const targetType = nullableText(row.target_type, "menuItem.target_type");
  if (targetType !== null && !MENU_TARGET_TYPES.has(targetType)) throw new TypeError("menuItem.target_type desteklenmiyor.");
  const categoryId = nullablePositiveInteger(row.category_id, "menuItem.category_id");
  const collectionId = nullablePositiveInteger(row.collection_id, "menuItem.collection_id");
  const hasInternalUrl = boolean(row.has_internal_url, "menuItem.has_internal_url");
  const validTarget = (targetType === null && categoryId === null && collectionId === null && !hasInternalUrl)
    || (targetType === "category" && categoryId !== null && collectionId === null && !hasInternalUrl)
    || (targetType === "collection" && categoryId === null && collectionId !== null && !hasInternalUrl)
    || (targetType === "internal_url" && categoryId === null && collectionId === null && hasInternalUrl);
  if (!validTarget) throw new TypeError("menuItem hedef alanları tutarsız.");
  return Object.freeze({
    id: positiveInteger(row.id, "menuItem.id"),
    menuId: positiveInteger(row.menu_id, "menuItem.menu_id"),
    menuCode,
    parentId: nullablePositiveInteger(row.parent_id, "menuItem.parent_id"),
    title: requiredText(row.title, "menuItem.title"),
    targetType,
    categoryId,
    collectionId,
    hasInternalUrl,
    sortOrder: integer(row.sort_order, "menuItem.sort_order"),
    active: boolean(row.is_active, "menuItem.is_active"),
    revision: positiveInteger(row.revision, "menuItem.revision"),
  });
};

export function normalizeCatalogStructureSummary(payload) {
  if (payload?.catalogMode !== "first_party") throw new TypeError("catalogStructure.catalogMode first_party olmalıdır.");
  if (payload?.structureScope !== "shared_catalog") throw new TypeError("catalogStructure.structureScope shared_catalog olmalıdır.");
  return Object.freeze({
    catalogMode: "first_party",
    structureScope: "shared_catalog",
    categories: normalizePage(payload.categories, normalizeCategory, "catalogStructure.categories"),
    attributeDefinitions: normalizePage(payload.attributeDefinitions, normalizeAttributeDefinition, "catalogStructure.attributeDefinitions"),
    attributeTemplates: normalizePage(payload.attributeTemplates, normalizeAttributeTemplate, "catalogStructure.attributeTemplates"),
    collections: normalizePage(payload.collections, normalizeCollection, "catalogStructure.collections"),
    menus: normalizePage(payload.menus, normalizeMenu, "catalogStructure.menus"),
    menuItems: normalizePage(payload.menuItems, normalizeMenuItem, "catalogStructure.menuItems"),
  });
}

export function filterCatalogStructureItems(items, query, fields) {
  const normalized = String(query || "").trim().toLocaleLowerCase("tr-TR");
  if (!normalized) return items;
  return items.filter((item) => fields
    .map((field) => (typeof field === "function" ? field(item) : item[field]))
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLocaleLowerCase("tr-TR")
    .includes(normalized));
}

export const isCatalogStructureItemActive = (item) => item.active === true && !item.deletedAt;
