const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const readFrontend = (file) => fs.readFileSync(path.join(root, 'frontend', file), 'utf8');

const sources = {
    index: readFrontend('index.html'),
    product: readFrontend('product.html'),
    profile: readFrontend('profile.html'),
    checkout: readFrontend('checkout.html'),
    paytrCheckout: readFrontend('paytr-checkout.html'),
    paymentResult: readFrontend('payment-result.html'),
    forgotPassword: readFrontend('forgot-password.html'),
    resetPassword: readFrontend('reset-password.html'),
    catalog: readFrontend('catalog-navigation.js'),
    collections: readFrontend('storefront-collections.js'),
    favorites: readFrontend('favorites-sync.js'),
    chat: readFrontend('chat.js')
};

assert(sources.catalog.includes('placeholder="En az '));
assert(sources.catalog.includes('placeholder="En fazla '));
assert(sources.catalog.includes('Detayları Gör'));
assert(sources.collections.includes("'Güncel Seçki'"));
assert(sources.collections.includes('Detayları Gör'));

for (const source of [sources.index, sources.product, sources.catalog, sources.collections]) {
    assert(source.includes('Stokta Yok'));
}

for (const source of [sources.index, sources.product, sources.profile]) {
    assert(source.includes('Sepetiniz boş.'));
}

assert(sources.product.includes('>Kaldır</button>'));
assert(sources.favorites.includes("'Geçersiz ürün bilgisi.'"));
assert(sources.profile.includes('Henüz favori ürününüz yok. Ürünleri keşfetmeye başlayın.'));
assert(sources.profile.includes('Henüz siparişiniz yok.'));
assert(sources.profile.includes('${item.quantity} adet'));
assert(sources.profile.includes('×${firstItemQty}'));
assert(sources.profile.includes('Oturum bilgisi doğrulanamadı.'));
assert(sources.profile.includes('Sunucuya bağlanılamadı.'));
assert(sources.profile.includes('Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.'));

assert(sources.checkout.includes('placeholder="AA/YY"'));
assert(sources.checkout.includes('${item.quantity} adet ${item.name}'));
assert(sources.paytrCheckout.includes('Ödeme Adımına Dön'));
assert(sources.paytrCheckout.includes('Lütfen ödeme adımından tekrar deneyin.'));
assert(sources.paytrCheckout.includes('Sipariş No: ${orderId} · Ödeme Referansı: ${paymentRef}'));
assert(sources.paymentResult.includes('(Ödeme Referansı: ${paymentRef})'));

assert(sources.forgotPassword.includes('Şifre Sıfırlama Bağlantısı Gönder'));
assert(sources.resetPassword.includes('Yeni bağlantı isteyin'));
assert(sources.chat.includes('<span>NovaBot</span>'));
assert(sources.chat.includes('NovaBot görüşme özeti'));
assert(sources.chat.includes("'Stokta var' : 'Stokta yok'"));
assert(sources.chat.includes('Detayları Gör'));
assert(sources.chat.includes("'Kullanıcı' : 'Asistan'"));
assert(sources.index.includes("product?.name || 'Ürün'"));
assert(sources.product.includes("'Ürün medyası'"));

const visibleLegacyTerms = [
    'placeholder="Min ',
    'placeholder="Max ',
    'Dinamik koleksiyon',
    'Tükendi',
    'Satın alınamaz',
    'Ürünü incele',
    'Sepetiniz şu an bomboş.',
    'Favori listeniz şu an boş görünüyor.',
    "Checkout'a Dön",
    'Lütfen checkout ekranından',
    'Sıfırlama Linki Gönder',
    'Yeniden link isteyin',
    'NovaStore AI Asistan',
    '>AI Asistan<',
    'AI devir özeti',
    'Ürüne git',
    '>Kaldir</button>',
    "'Urun'",
    "'Urun medyasi'",
    "'Kullanici'",
    'Gecersiz urun id.',
    'Oturum bilgisi dogrulanamadi.',
    'Oturum suresi dolmus.'
];

const combinedSource = Object.values(sources).join('\n');
for (const legacyTerm of visibleLegacyTerms) {
    assert(!combinedSource.includes(legacyTerm), `Legacy storefront term remains: ${legacyTerm}`);
}

assert(sources.collections.includes("collection.collection_type === 'dynamic'"));
assert(sources.paymentResult.includes("result.paymentStatus === 'PAID'"));
assert(sources.paymentResult.includes("result.paymentStatus === 'FAILED'"));
assert(sources.chat.includes('AI_HANDOFF_PREFIX'));
assert(sources.chat.includes("'support history failed'"));
assert(sources.profile.includes('Authentication required|Invalid or expired token|Access denied'));
assert(sources.checkout.includes('novastore_pending_checkout_'));
assert(sources.paytrCheckout.includes('novastore.paytrCheckout.'));

console.log('web storefront terminology smoke passed');
