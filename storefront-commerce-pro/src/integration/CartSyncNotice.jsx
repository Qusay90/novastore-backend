import React, { useState } from "react";
import "./cart-migration.css";

export function CartPurchaseLimitNotice({ items }) {
  if (!items.some((item) => item.quantity > 20) && items.reduce((sum, item) => sum + item.quantity, 0) <= 50) return null;
  return <aside className="cart-migration-notice shell" role="status"><strong>Sepetindeki tüm kayıtlar korundu.</strong>
    <p>Sipariş başına toplam 50, aynı ürün seçeneğinden 20 adet satın alınabilir. Ödemeden önce adetleri azaltabilir veya istemediğin satırları kaldırabilirsin.</p>
    <a href="#/sepet">Sepetteki adetleri düzenle</a></aside>;
}

export function CartSyncNotice({ cart, status, authenticated, onLogout }) {
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  if (status?.phase !== "blocked") return null;
  const retry = async () => {
    setBusy(true); setIssue("");
    try { await cart.retrySync(); } catch { /* The authoritative sync status owns the visible error. */ }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setIssue("");
    try { await onLogout(); } catch (error) { setIssue(error.message || "Çıkış tamamlanamadı."); }
    finally { setBusy(false); }
  };
  return <aside className="cart-migration-notice shell" role="alert" aria-label="Sepet eşitlemesi gerekli">
    <strong>Sepetin şu anda doğrulanamıyor.</strong>
    <p>{status.message} Ürünleri incelemeye devam edebilirsin. Sepet değişiklikleri ve ödeme, doğrulama tamamlanana kadar kapalı.</p>
    <div><button type="button" disabled={busy} onClick={retry}>Yeniden eşitle</button>{" · "}
      {authenticated ? <button type="button" disabled={busy} onClick={logout}>Hesabımdan çıkış yap</button> : <a href="#/giris">Yeniden giriş yap</a>}</div>
    {issue && <p>{issue}</p>}
  </aside>;
}
