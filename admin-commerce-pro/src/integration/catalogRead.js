export const CATALOG_PUBLICATION_STATUS_LABELS = Object.freeze({
  draft: "Taslak",
  pending_approval: "İç yayın incelemesi",
  active: "Yayında",
  inactive: "Yayın dışı",
  rejected: "Yayınlanmamış",
  archived: "Arşivli",
  deleted: "Arşivli kayıt",
});

export const CATALOG_PUBLICATION_FILTER_OPTIONS = Object.freeze([
  ["all", "Tüm yayın durumları"],
  ["active", "Yayında"],
  ["draft", "Taslak"],
  ["pending_approval", "İç yayın incelemesi"],
  ["inactive", "Yayın dışı"],
  ["rejected", "Yayınlanmamış"],
  ["archived", "Arşivli"],
  ["deleted", "Arşivli kayıt"],
]);

export const resolveCatalogPublicationStatus = (product) => (
  product.deletedAt ? "deleted" : product.publicationStatus
);

export const isCatalogProductEffectivelyVisible = (product) => !product.deletedAt
  && product.publicationStatus === "active"
  && product.customerVisible;

export function filterFirstPartyCatalogProducts(products, {
  publication = "all",
  query = "",
  stock = "all",
  visibility = "all",
} = {}) {
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  return products.filter((product) => {
    const publicationStatus = resolveCatalogPublicationStatus(product);
    const customerVisible = isCatalogProductEffectivelyVisible(product);
    const matchesPublication = publication === "all" || publicationStatus === publication;
    const matchesStock = stock === "all" || (stock === "in_stock" ? product.stock > 0 : product.stock === 0);
    const matchesVisibility = visibility === "all"
      || (visibility === "visible" ? customerVisible : !customerVisible);
    const haystack = `${product.id} ${product.rawId} ${product.name} ${product.primaryCategoryName || ""} ${product.primaryCategoryPath || ""}`
      .toLocaleLowerCase("tr-TR");
    return matchesPublication && matchesStock && matchesVisibility && (!normalized || haystack.includes(normalized));
  });
}
