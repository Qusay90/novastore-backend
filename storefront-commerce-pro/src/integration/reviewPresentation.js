// Build-time copy and semantic-role adapter for the public review entry point only.
// Canonical HTML, JSX, CSS, layout and image authorities remain byte-identical.
export const REVIEW_COPY = Object.freeze([
  ['className="runtime-product-thumbnails" aria-label=', 'className="runtime-product-thumbnails" role="group" aria-label='],
  ['aria-label="Görünüm"', 'role="group" aria-label="Görünüm"'],
  ['Güvenli ödemeye geç', 'Alışveriş koşullarını incele'],
  ['Güvenli ödeme ve hesap destekli işlemler', 'Yayına hazırlık ve müşteri desteği'],
  ['Güvenli ödeme ve kolay iade', 'Alışveriş koşulları incelemeye açık'],
  ['Güvenli ödeme ve taksit seçenekleri', 'Ödeme hizmetimiz yayına hazırlanıyor'],
  ['Güvenli ödeme', 'Ödeme yakında'],
  ['Kart verisi sağlayıcı ekranında girilir', 'Gerçek ödeme henüz kapalı'],
  ['Sağlayıcı ekranında tamamlanır', 'Gerçek ödeme henüz kapalı'],
  ['İade koşulları onaylı politikada', 'İade koşulları incelemeye açık'],
  ['Onaylı politikadan görüntülenir', 'Hazırlık metninden görüntülenir'],
  ['Kupon, teslimat ve ödeme seçenekleri güvenli ödeme sayfasında doğrulanır.', 'Bu sepet inceleme içindir. Gerçek sipariş ve ödeme henüz kapalıdır.'],
  ['Ödeme bilgileriniz güvenle korunur', 'Bu aşamada kart bilgisi istenmez'],
  ["NovaStore'da sat", 'Satıcı bilgilendirmesi'],
  ['NovaStore’da satış yap ve müşterilere ulaş', 'Satıcı koşulları hakkında bilgi al'],
  ["Kategori, ürün ve koleksiyonlar aynı-origin NovaStore API'sinden yükleniyor.", 'Ürünler yükleniyor. Lütfen kısa bir süre bekleyin.'],
  ['Public katalog şu anda boş. Örnek veya sahte ürün gösterilmiyor.', 'Ürünlerimiz yayına hazırlanıyor. Lütfen daha sonra tekrar ziyaret edin.'],
]);
export const reviewPresentation = source => REVIEW_COPY.reduce((text,[before,after])=>text.replaceAll(before,after),source);
