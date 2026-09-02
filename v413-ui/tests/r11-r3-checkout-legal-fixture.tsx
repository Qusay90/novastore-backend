import React from "react";
import ReactDOM from "react-dom/client";

import { CheckoutLegalConsent } from "../src/checkout/CheckoutLegalConsent";
import type { CustomerCheckoutAgreement } from "../src/checkout/customerCheckoutApi";
import "../src/styles.css";
import "../src/prototype.css";
import "./r11-r3-checkout-legal-fixture.css";

const DOCUMENT_HASH = "a".repeat(64);
const documents: readonly CustomerCheckoutAgreement[] = Object.freeze([
  Object.freeze({
    slug: "pre-information",
    path: "/legal/pre-information-form",
    title: "Ön Bilgilendirme Formu",
    version: "r11-uat-test-v1",
    text: "Sipariş, teslimat ve toplam bilgileri için yetkili sözleşme metni.\n".repeat(28),
    contentSha256: DOCUMENT_HASH,
  }),
  Object.freeze({
    slug: "distance-sale",
    path: "/legal/distance-sales-contract",
    title: "Mesafeli Satış Sözleşmesi",
    version: "r11-uat-test-v1",
    text: "Satış koşulları, cayma ve iade hakları için yetkili sözleşme metni.\n".repeat(28),
    contentSha256: DOCUMENT_HASH,
  }),
]);

function CheckoutLegalFixture() {
  const [acceptedSlugs, setAcceptedSlugs] = React.useState<ReadonlySet<string>>(() => new Set());
  const tablet = new URLSearchParams(window.location.search).get("layout") === "tablet";
  return (
    <main className={`r11-r3-checkout-fixture cal-app ${tablet ? "layout-tablet" : "layout-phone"}`}>
      <div className="r11-r3-fixture-scroll" data-testid="fixture-scroll">
        <div className="r11-r3-fixture-content">
          <section className="checkout-main">
            <section className="payment-methods"><h2>Ödeme Yöntemi</h2><div><button type="button" className="active" aria-pressed="true">PayTR güvenli ödeme</button></div></section>
            <article className="checkout-provider-card" data-testid="fixture-provider-card">
              <header><span className="r11-r3-provider-lock" aria-hidden="true">✓</span><div><h2>Güvenli sağlayıcı alanı</h2><p>PayTR yapılandırması bulunmadığından ödeme güvenli biçimde kapalıdır.</p></div></header>
              <small className="checkout-provider-privacy">Kart bilgileri NovaStore tarafından alınmaz veya saklanmaz.</small>
            </article>
            <CheckoutLegalConsent
              documents={documents}
              acceptedSlugs={acceptedSlugs}
              onConsentChange={(slug, accepted) => setAcceptedSlugs((current) => {
                const next = new Set(current);
                if (accepted) next.add(slug);
                else next.delete(slug);
                return next;
              })}
            />
          </section>
          <aside className="checkout-summary">
            <section className="checkout-summary-card"><h2>Sipariş Özeti</h2><p className="muted">1 ürün · sunucu doğrulamalı</p><div className="summary-rows"><p><span>Ara toplam</span><b>₺1.000,00</b></p><p><span>Kargo</span><b>₺0,00</b></p><hr /><p className="total"><span>Toplam</span><b>₺1.000,00</b></p></div></section>
            <button className="primary navy" type="button" disabled>Ödeme henüz etkin değil</button>
            <p className="checkout-payment-gate" role="status">Ödeme sağlayıcısı etkinleştirilmeden sipariş oluşturulmaz.</p>
            <small className="secure-copy">Ödeme sonucu yalnız PC1 sunucu durumuyla kesinleşir</small>
          </aside>
        </div>
      </div>
      <nav className="bottom-nav r11-r3-fixture-nav" aria-label="Müşteri alt navigasyonu" data-testid="fixture-bottom-nav">
        {['Ana Sayfa', 'Kategoriler', 'Favoriler', 'Sepetim', 'Destek', 'Hesabım'].map((label) => <span key={label}>{label}</span>)}
      </nav>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<CheckoutLegalFixture />);
