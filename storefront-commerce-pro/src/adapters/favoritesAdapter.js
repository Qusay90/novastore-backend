const requiredMethods = ["loadFavoriteIds", "setFavorite", "reportError"];

const requireFavoritesOwner = (root) => {
  const owner = root?.NovaStoreFavorites;
  const missing = requiredMethods.filter((method) => typeof owner?.[method] !== "function");
  if (missing.length) {
    throw new Error(`NovaStoreFavorites sözleşmesi hazır değil: ${missing.join(", ")}`);
  }
  return owner;
};

const normalizeIds = (values) => new Set(
  [...(values instanceof Set ? values : Array.isArray(values) ? values : [])]
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0),
);

export function createFavoritesAdapter({ root = globalThis } = {}) {
  const owner = requireFavoritesOwner(root);

  const load = async ({ allowedProductIds } = {}) => {
    const ids = normalizeIds(await owner.loadFavoriteIds({
      onError: (error) => owner.reportError(
        error,
        "Favoriler şu anda senkronlanamadı. Son yerel seçiminiz korunuyor.",
      ),
    }));
    if (!(allowedProductIds instanceof Set)) return ids;
    return new Set([...ids].filter((id) => allowedProductIds.has(id)));
  };

  const set = async (productId, shouldFavorite) => {
    const id = Number(productId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("Geçersiz ürün kimliği.");
    return owner.setFavorite(id, shouldFavorite === true);
  };

  return Object.freeze({ load, set, isAuthenticated: owner.isAuthenticated?.bind(owner) });
}

export const favoritesAdapterTestUtils = Object.freeze({ normalizeIds, requireFavoritesOwner });
