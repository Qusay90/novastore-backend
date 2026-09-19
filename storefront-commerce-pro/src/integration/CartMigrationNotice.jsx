import React, { useEffect, useState } from "react";
import "./cart-migration.css";

export function CartMigrationNotice({ cart, products = [] }) {
  const [migration, setMigration] = useState(() => cart.getMigration?.() || {});
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  useEffect(() => cart.subscribeMigration?.(() => setMigration(cart.getMigration())) || (() => {}), [cart]);
  const rows = [...(migration.unresolvedItems || []).map((item) => ({ ...item, localOnly: false })),
    ...(migration.localItems || []).map((item) => ({ ...item, localOnly: true }))];
  if (!rows.length) return null;
  const remove = async (item) => {
    setBusy(true); setIssue("");
    try { await cart.resolveLegacy(item.productId, item.localOnly, item.variantId ?? null); setMigration(cart.getMigration()); }
    catch (error) { setIssue(error.message || "Eski kayıt kaldırılamadı."); }
    finally { setBusy(false); }
  };
  return <aside className="cart-migration-notice shell" aria-label="Eski sepetini kontrol et">
    <strong>Eski sepetindeki bazı ürünlerin seçeneklerini yeniden seçmelisin.</strong>
    <p>Bu kayıtlar korunuyor. Ürünü açıp doğru seçeneği ekleyebilir, ardından eski kaydı kaldırabilirsin.</p>
    <ul>{rows.map((item) => {
      const product = products.find((candidate) => Number(candidate.id) === item.productId);
      return <li key={`${item.localOnly}:${item.productId}:${item.variantId ?? "none"}`}><span>{product?.name || `Ürün #${item.productId}`} {item.variantId ? `· Seçenek #${item.variantId}` : ""} · {item.quantity} adet</span>
        <a href={product?.slug ? `#/urun/${product.slug}` : `#/urun-id/${item.productId}`}>Ürünü aç ve seçeneği seç</a>
        <button disabled={busy} type="button" onClick={() => remove(item)}>Eski kaydı kaldır</button></li>;
    })}</ul>
    {issue && <p role="alert">{issue}</p>}
  </aside>;
}
