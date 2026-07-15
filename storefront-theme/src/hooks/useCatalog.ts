import { useQuery } from "@tanstack/react-query";
import { getCategories, getCollections, getProduct, getProducts } from "../api/catalog";
import { adaptCategories, adaptCollections } from "../adapters/categoryAdapter";
import { adaptProduct, adaptProductList } from "../adapters/productAdapter";

export const useProducts = () => useQuery({
  queryKey: ["storefront", "products"],
  queryFn: ({ signal }) => getProducts(signal).then(adaptProductList),
});

export const useProduct = (productId: number) => useQuery({
  queryKey: ["storefront", "product", productId],
  queryFn: ({ signal }) => getProduct(productId, signal).then(adaptProduct),
  enabled: Number.isInteger(productId) && productId > 0,
  retry: false,
});

export const useCategories = () => useQuery({
  queryKey: ["storefront", "categories"],
  queryFn: ({ signal }) => getCategories(signal).then(adaptCategories),
});

export const useCollections = () => useQuery({
  queryKey: ["storefront", "collections"],
  queryFn: ({ signal }) => getCollections(signal).then(adaptCollections),
});
