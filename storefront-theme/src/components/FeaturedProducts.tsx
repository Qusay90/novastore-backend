import { ArrowRight } from "lucide-react";
import { useFavorites } from "../hooks/useFavorites";
import type { Product } from "../types/catalog";
import { ProductCard } from "./ProductCard";

interface FeaturedProductsProps { products: Product[]; }

export function FeaturedProducts({ products }: FeaturedProductsProps) {
  const { favoriteIds, mutation } = useFavorites();
  const toggleFavorite = (productId: number, favorite: boolean) => mutation.mutate({ productId, favorite });
  return <section className="section products-section" id="urunler"><div className="section-heading"><div><span className="eyebrow">Öne Çıkanlar</span><h2>Senin için seçtiklerimiz</h2></div><a href="/kategori/tumu">Tümünü Gör <ArrowRight /></a></div><div className="product-grid">{products.slice(0, 8).map((product) => <ProductCard key={product.id} product={product} favorite={favoriteIds.has(product.id)} onToggleFavorite={toggleFavorite} />)}</div></section>;
}
