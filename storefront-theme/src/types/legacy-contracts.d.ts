import type { CartItem } from "./catalog";

interface NovaStoreFavoritesContract {
  isAuthenticated(): boolean;
  loadFavoriteIds(options?: { onError?: (error: unknown) => void }): Promise<Set<number>>;
  setFavorite(productId: number, shouldFavorite: boolean): Promise<unknown>;
  reportError(error: unknown, message?: string): void;
}

interface NovaStoreSharedStateContract {
  isAuthenticated(): boolean;
  hydrateCart(): Promise<void>;
  loadCart(): Promise<CartItem[]>;
  saveCart(items: CartItem[]): Promise<unknown>;
  saveCheckout(payload: { items: CartItem[] }): Promise<unknown>;
  writeCartLocal(items: CartItem[]): CartItem[];
  normalizeCartItems(items: CartItem[]): CartItem[];
  formatPrice(value: number): string;
  reportError(scope: string, error: unknown, message: string): void;
}

declare global {
  interface Window {
    NovaStoreFavorites?: NovaStoreFavoritesContract;
    NovaStoreSharedState?: NovaStoreSharedStateContract;
  }
}

export {};
