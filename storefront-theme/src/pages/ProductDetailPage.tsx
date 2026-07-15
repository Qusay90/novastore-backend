import { ArrowLeft, Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useRoute } from "wouter";
import { ResourceState } from "../components/ResourceState";
import { useFavorites } from "../hooks/useFavorites";
import { useProduct } from "../hooks/useCatalog";
import { useCart } from "../state/CartContext";

export function ProductDetailPage() {
  const [, params] = useRoute("/theme-preview/product/:id");
  const productId = Number(params?.id);
  const product = useProduct(productId);
  const { addProduct, busy } = useCart();
  const { favoriteIds, mutation } = useFavorites();
  const [quantity, setQuantity] = useState(1);
  if (!Number.isInteger(productId) || productId < 1) return <ResourceState title="Ürün bulunamadı" message="Geçerli bir ürün seçilmedi." />;
  if (product.isLoading) return <ResourceState title="Ürün hazırlanıyor" message="Ürün bilgileri yükleniyor…" />;
  if (product.isError || !product.data) return <ResourceState title="Ürün bulunamadı" message={product.error?.message || "Bu ürün artık vitrinde olmayabilir."} actionLabel="Ana Sayfa" onAction={() => { window.location.href = "/theme-preview"; }} />;
  const item = product.data;
  const favorite = favoriteIds.has(item.id);
  return <section className="detail section"><a className="back-link" href="/theme-preview"><ArrowLeft /> Alışverişe dön</a><div className="detail-grid"><div className="detail-media">{item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <div className="image-placeholder">NovaStore</div>}</div><div className="detail-copy"><span className="eyebrow">{item.category}</span><h1>{item.name}</h1><p className="detail-description">{item.description || "Ürün açıklaması yakında eklenecek."}</p><div className="detail-price"><strong>{item.price.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} TL</strong>{item.oldPrice ? <del>{item.oldPrice.toLocaleString("tr-TR")} TL</del> : null}</div><span className={item.purchasable ? "stock available" : "stock"}>{item.purchasable ? `Stokta · ${item.stock} adet` : "Stokta yok"}</span><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Adedi azalt"><Minus /></button><strong>{quantity}</strong><button onClick={() => setQuantity(Math.min(999, quantity + 1))} aria-label="Adedi artır"><Plus /></button></div><div className="detail-actions"><button className="button primary" disabled={!item.purchasable || busy} onClick={() => addProduct(item, quantity)}><ShoppingBag /> Sepete Ekle</button><button className={favorite ? "button favorite-detail active" : "button favorite-detail"} onClick={() => mutation.mutate({ productId: item.id, favorite: !favorite })}><Heart /> {favorite ? "Favoride" : "Favoriye Ekle"}</button></div>{item.attributes.length ? <dl className="attributes">{item.attributes.map((attribute) => <div key={attribute.code}><dt>{attribute.name}</dt><dd>{String(attribute.value ?? "-")} {attribute.unit}</dd></div>)}</dl> : null}</div></div></section>;
}
