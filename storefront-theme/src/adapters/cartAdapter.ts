import { readCustomerSession } from "../api/customerSession";
import type { CartItem, Product } from "../types/catalog";

function sharedStateContract() {
  if (!window.NovaStoreSharedState) throw new Error("NovaStore shared-state sözleşmesi yüklenemedi.");
  return window.NovaStoreSharedState;
}

function cartStorageKey(): string {
  const session = readCustomerSession();
  return `novastore_cart_${session.userId ?? "guest"}`;
}

function readLocalCart(): CartItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(cartStorageKey()) || "[]") as CartItem[];
    return sharedStateContract().normalizeCartItems(raw);
  } catch {
    return [];
  }
}

export async function loadCart(): Promise<CartItem[]> {
  const sharedState = sharedStateContract();
  if (!sharedState.isAuthenticated()) return readLocalCart();
  await sharedState.hydrateCart();
  return readLocalCart();
}

export async function saveCart(items: CartItem[]): Promise<CartItem[]> {
  const sharedState = sharedStateContract();
  const normalized = sharedState.writeCartLocal(items);
  if (sharedState.isAuthenticated()) await sharedState.saveCart(normalized);
  window.dispatchEvent(new CustomEvent("novastore:shared-cart-updated", { detail: { items: normalized } }));
  return normalized;
}

export async function handoffCheckout(items: CartItem[]): Promise<void> {
  const sharedState = sharedStateContract();
  const normalized = sharedState.writeCartLocal(items.filter((item) => item.selected));
  if (sharedState.isAuthenticated()) await sharedState.saveCheckout({ items: normalized });
}

export function productToCartItem(product: Product, quantity = 1): CartItem {
  return {
    id: product.id,
    productId: product.id,
    name: product.name,
    price: product.price,
    oldPrice: product.oldPrice,
    image: product.imageUrl,
    imageUrl: product.imageUrl,
    quantity,
    selected: true,
  };
}
