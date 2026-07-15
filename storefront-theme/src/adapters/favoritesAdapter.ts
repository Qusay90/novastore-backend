function favoritesContract() {
  if (!window.NovaStoreFavorites) throw new Error("NovaStore favori sözleşmesi yüklenemedi.");
  return window.NovaStoreFavorites;
}

export const loadFavoriteIds = (onError?: (error: unknown) => void): Promise<Set<number>> => (
  favoritesContract().loadFavoriteIds({ onError })
);

export const setFavorite = (productId: number, shouldFavorite: boolean): Promise<unknown> => (
  favoritesContract().setFavorite(productId, shouldFavorite)
);

export const reportFavoriteError = (error: unknown): void => {
  favoritesContract().reportError(error, "Favori işlemi şu anda tamamlanamadı. Seçiminiz değiştirilmedi.");
};
