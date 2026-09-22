// Extend the generated canonical presentation, never the sealed visual source.
export function integratePublicDiscovery(source) {
  source = source.replace('<a className="text-link" href="#/koleksiyon/firsatlar">Tümünü gör', '<a className="text-link" href="#/arama">Tümünü gör');
  const start = source.indexOf("function ProductListing(");
  const end = source.indexOf("\nfunction ProductDetail(", start);
  if (start < 0 || end < 0) throw new Error("Canonical listing boundary drifted");
  let listing = source.slice(start, end);
  const replace = (from, to) => {
    if (!listing.includes(from)) throw new Error(`Canonical discovery slot drifted: ${from}`);
    listing = listing.replaceAll(from, to);
  };
  replace("title, favorites, onFavorite, onAdd })", "title, favorites, onFavorite, onAdd, discovery })");
  replace('  const [selectedBrands', '  const remote = usePublicDiscovery(discovery);\n  initialItems = discovery ? remote.page.items : initialItems;\n  const [selectedBrands');
  replace('      if (selectedBrands.size', '      if (discovery) return true;\n      if (selectedBrands.size');
  replace('return sortProducts(result, sort);', 'return discovery && sort === "featured" ? result : sortProducts(result, sort);');
  replace('  const clear = () => {', '  if (discovery) activeFilters.splice(0, activeFilters.length, ...remote.activeFilters);\n  const clear = () => { remote.clear();');
  replace('<Filters {...filterProps} />', '{discovery ? <PublicAttributeFilters {...remote.filters} /> : <Filters {...filterProps} />}');
  replace('{filtered.length} ürün listeleniyor', '{filtered.length} {discovery ? "ürün yüklendi" : "ürün listeleniyor"}{discovery && remote.page.pagination?.hasMore ? "; daha fazlası var" : ""}');
  replace('<strong>{filtered.length}</strong> sonuç', '<strong>{filtered.length}</strong> {discovery ? "yüklenen sonuç" : "sonuç"}');
  replace('{getProductsForCategory(item.id).length}', '{item.descendantVisibleProductCount}');
  replace('<span className="sr-only">Sırala</span>', '<span className="sr-only">{discovery ? "Yüklenen ürünlerde sırala" : "Sırala"}</span>');
  replace('<span>Sırala:</span>', '<span>{discovery ? "Yüklenenlerde sırala:" : "Sırala:"}</span>');
  replace('{filtered.length} ürünü göster', '{discovery ? "Yüklenen " : ""}{filtered.length} ürünü göster');
  replace('<ProductGrid items={filtered} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} compact={compact} />',
    '{(!discovery || remote.page.data) && <ProductGrid items={filtered} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} compact={compact} />}\n            {discovery && <PageContinuation page={remote.page} />}');
  return 'import { usePublicDiscovery, PublicAttributeFilters } from "./integration/PublicDiscovery.jsx";\nimport { PageContinuation } from "./integration/PageContinuation.jsx";\n'
    + source.slice(0, start) + listing + source.slice(end);
}
