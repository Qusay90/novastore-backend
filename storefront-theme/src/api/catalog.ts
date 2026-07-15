import { storefrontGet } from "./httpClient";

export const getProducts = (signal?: AbortSignal): Promise<unknown> => storefrontGet("/api/products", signal);

export const getProduct = (productId: number, signal?: AbortSignal): Promise<unknown> => (
  storefrontGet(`/api/products/${productId}`, signal)
);

export const getCategories = (signal?: AbortSignal): Promise<unknown> => (
  storefrontGet("/api/public/categories?format=tree", signal)
);

export const getCollections = (signal?: AbortSignal): Promise<unknown> => (
  storefrontGet("/api/public/collections", signal)
);
