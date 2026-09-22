export function PublicReviewAccount({registration=false}) {
  return <main id="main-content" className="page auth-page"><div className="shell"><section className="auth-card">
    <h1>{registration?'Üyelik için hazırlanıyoruz':'Mevcut müşteri hesabınız'}</h1>
    <p>Yeni üyelik ve gerçek ödeme yayına hazırlık süresince kapalıdır. Kataloğu ve alışveriş koşullarını hesap oluşturmadan inceleyebilirsiniz.</p>
    <p>Mevcut hesabınızın sipariş ve güvenlik işlemlerine müşteri girişinden ulaşabilirsiniz.</p>
    <a className="primary-button" href="/login.html">Müşteri girişine git</a>
    <p><a href="/iletisim">İletişim</a> · <a href="/kullanim-ve-uyelik-kosullari">Üyelik koşulları</a></p>
  </section></div></main>;
}

export function PublicReviewStoreUnavailable() {
  return <main id="main-content" className="page commerce-page"><div className="shell"><section className="legal-document-card" role="status">
    <h1>Mağaza sayfaları yayına hazırlanıyor</h1>
    <p>Mağazalara ait ayrıntılı bilgiler henüz kullanılamıyor. Mevcut ürünleri kataloğumuzdan inceleyebilirsiniz.</p>
    <p><a href="/#/arama">Ürünleri incele</a> · <a href="/iletisim">İletişim ve destek</a></p>
  </section></div></main>;
}
