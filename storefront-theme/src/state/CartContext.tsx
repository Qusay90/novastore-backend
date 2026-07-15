import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type PropsWithChildren, useContext } from "react";
import { handoffCheckout, loadCart, productToCartItem, saveCart } from "../adapters/cartAdapter";
import type { CartItem, Product } from "../types/catalog";

interface CartContextValue {
  items: CartItem[];
  loading: boolean;
  busy: boolean;
  addProduct(product: Product, quantity?: number): Promise<void>;
  setQuantity(productId: number, quantity: number): Promise<void>;
  removeProduct(productId: number): Promise<void>;
  checkout(): Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const cart = useQuery({ queryKey: ["storefront", "cart"], queryFn: loadCart, staleTime: 10_000 });
  const mutation = useMutation({
    mutationFn: saveCart,
    onSuccess: (items) => queryClient.setQueryData(["storefront", "cart"], items),
  });
  const items = cart.data ?? [];
  const persist = async (nextItems: CartItem[]) => { await mutation.mutateAsync(nextItems); };

  const addProduct = async (product: Product, quantity = 1) => {
    const existing = items.find((item) => item.productId === product.id);
    const next = existing
      ? items.map((item) => item.productId === product.id ? { ...item, quantity: Math.min(999, item.quantity + quantity) } : item)
      : [...items, productToCartItem(product, quantity)];
    await persist(next);
  };
  const setQuantity = async (productId: number, quantity: number) => {
    if (quantity < 1) return;
    await persist(items.map((item) => item.productId === productId ? { ...item, quantity: Math.min(999, quantity) } : item));
  };
  const removeProduct = async (productId: number) => persist(items.filter((item) => item.productId !== productId));
  const checkout = async () => handoffCheckout(items);

  return <CartContext.Provider value={{ items, loading: cart.isLoading, busy: mutation.isPending, addProduct, setQuantity, removeProduct, checkout }}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart yalnız CartProvider içinde kullanılabilir.");
  return context;
}
