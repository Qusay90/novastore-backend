import { Heart, ShoppingBag, Star } from "lucide-react";
import { Link } from "wouter";
import { useCart } from "../state/CartContext";
import type { Product } from "../types/catalog";

interface ProductCardProps { product: Product; favorite: boolean; onToggleFavorite(productId: number, favorite: boolean): void; }

export function ProductCard({ product, favorite, onToggleFavorite }: ProductCardProps) {
  const { addProduct, busy } = useCart();
  const discount = product.oldPrice && product.oldPrice > product.price ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
  return <article className="product-card"><div className="product-media">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} loading="lazy" /> : <div className="image-placeholder">NovaStore</div>}{discount > 0 ? <span className="discount">%{discount}</span> : null}<button className={favorite ? "favorite active" : "favorite"} onClick={() => onToggleFavorite(product.id, !favorite)} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}><Heart /></button></div><div className="product-body"><span className="product-category">{product.category}</span><Link href={`/theme-preview/product/${product.id}`}><h3>{product.name}</h3></Link><div className="rating"><Star /> <span>{product.rating ? product.rating.toFixed(1) : "Yeni"}</span><small>{product.reviewCount ? `(${product.reviewCount})` : ""}</small></div><div className="product-footer"><div><strong>{product.price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</strong>{product.oldPrice ? <del>{product.oldPrice.toLocaleString("tr-TR")} TL</del> : null}</div><button disabled={!product.purchasable || busy} onClick={() => addProduct(product)} aria-label={`${product.name} sepete ekle`}><ShoppingBag /></button></div>{!product.purchasable ? <span className="sold-out">Stokta yok</span> : null}</div></article>;
}
