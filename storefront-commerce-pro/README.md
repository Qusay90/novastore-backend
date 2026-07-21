# NovaStore Commerce Pro müşteri teması

Bu paket, Commerce Pro kanonik görünümünü NovaStore müşteri sözleşmelerine
adapter ve runtime sınırları üzerinden bağlar. Kanonik görünüm yeniden
tasarlanmaz; entegrasyon yalnız veri, durum ve güvenli API davranışlarını ekler.

## Bağlayıcı kanonik kaynaklar

`canonical/NovaStore-Commerce-Pro.html` ve bu HTML'den çıkarılmış `src/App.jsx`
birlikte tek bağlayıcı görsel kaynak setidir. Aşağıdaki hashler korunur:

- `canonical/NovaStore-Commerce-Pro.html`:
  `8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d`
- `src/App.jsx`:
  `d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6`
- `src/catalog.js`:
  `a38d2e5f5a09fdc47bd9102800b04c423cf19b8d4d6bc952b77a5b77dc74062d`
- kanonik inline stylesheet / üretilen `src/canonical.css`:
  `5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896`

`npm run sync:canonical`, `src/canonical.css` dosyasını kanonik HTML'den üretir.
Kanonik HTML, `App.jsx`, `catalog.js` ve `canonical.css` elle değiştirilmez.

## Runtime mimarisi

`src/CanonicalRuntimePresentation.jsx`, runtime sunumunu doğrudan kanonik
`src/App.jsx` kaynağından üretir. Eski yeniden yazılmış `IntegratedApp` görsel
bileşenleri render edilmez. `src/IntegratedApp.jsx` yalnız Commerce Pro
sunumunu adapterlar, müşteri sayfaları, ürün topluluğu ve NovaBot runtime'ıyla
birleştiren uygulama sınırıdır.

Entegrasyon aynı Commerce Pro kabuğunda şunları bağlar:

- gerçek katalog, kategori, navigasyon ve koleksiyonlar;
- ürün detayı, stok, favori, sepet ve karşılaştırma;
- yorum, soru ve doğrulanmış değerlendirme sınırları;
- müşteri oturumu, profil, sipariş, adres, kupon, bildirim ve destek;
- server fiyatlı checkout ve mevcut güvenli ödeme sağlayıcısı köprüsü;
- canlı katalogla sınırlı ve eylem öncesi onay isteyen NovaBot.

Müşteri istekleri same-origin yöntem/rota allowlist'iyle sınırlandırılır; admin
tokenı okunmaz. Kart numarası, son kullanma tarihi veya CVV bu arayüzde
toplanmaz.

## Build ve test

Paket klasöründe temiz doğrulama:

```bash
cd storefront-commerce-pro
npm ci
npm run build
npm run build:integration
npm run build:fixture
npm test
npm run test:integration
```

`npm test`, paket içindeki 24 testi çalıştırır; kabul edilen sonuç **24/24
PASS**'tir. `npm run test:integration`, 21 integration-boundary testini
çalıştırır.

Repository kökünden Commerce Pro foundation ve ilgili mağaza smoke testleri:

```bash
node tests/commerceProFoundationSmoke.js
node tests/categoryPlpStorefrontSmoke.js
node tests/webCategoryNavigationFallbackSmoke.js
node tests/webCollectionStorefrontSmoke.js
node tests/webFavoritesRaceSmoke.js
node tests/webFavoritesSyncSmoke.js
node tests/webProductFavoriteAndCartUiSmoke.js
node tests/webSharedStateResilienceSmoke.js
node tests/webSharedStateSyncSmoke.js
node tests/webSharedStateUiSmoke.js
node tests/webStorefrontTerminologySmoke.js
```

Yerel geliştirme sunucusu:

```bash
cd storefront-commerce-pro
npm run dev -- --host 127.0.0.1
```

Vite'ın yazdırdığı localhost adresinde `/`, `/integrated.html` ve
`/fixture-integrated.html` girişleri açılabilir.

## Görsel kabul ve yayın sınırı

Commerce Pro kanonik görünüm eşleşmesi için **Visual UAT PASS** verilmiştir.
Generated preview dosyaları doğrulama çıktısıdır ve commit edilmez:

- `frontend/commerce-pro-preview/**`
- `frontend/commerce-pro-integration-preview/**`
- `artifacts/commerce-pro-qa/**`

Visual UAT kabulü cutover veya yayın yetkisi değildir. Henüz storefront cutover,
commit, push, PR, merge, deploy, production/uzak DB işlemi ya da gerçek ödeme
yapılmamıştır. Bu işlemlerin her biri ayrı ve açık kullanıcı onayı gerektirir.

## Deterministik production artifact adayı

Resmi müşteri rotalarını değiştirmeyen production artifact adayı şu zincirden
üretilir:

```text
cutover.html
→ src/main-integrated.jsx
→ src/IntegratedApp.jsx
→ src/integration/useCommerceRuntime.js
→ src/integration/createCommerceRuntime.js
```

Bu zincir gerçek catalog, customer, favorites, shared cart ve checkout
adapterlarını kullanır. `fixture-integrated.html`, `src/main-integrated-fixture.jsx`
ve `createCanonicalFixtureRuntime()` production artifact girdisi değildir.

Artifactı üretmek ve doğrulamak için:

```bash
npm run build:cutover
npm run test:cutover
# veya iki adımı birlikte
npm run verify:cutover
```

Build, Vite ara çıktısını yalnız işletim sistemi temp alanında oluşturur, gerekli
JS/CSS/assets içeriğini tek HTML içine gömer ve doğrulanan sonucu
`frontend/commerce-pro/index.html` yoluna taşır. Artifact elle düzenlenmez;
`scripts/finalize-cutover.mjs` ile yeniden üretilir. Aynı kaynaklarla tekrarlanan
build raw-byte olarak aynı sonucu vermelidir.

`frontend/` statik sunulduğu için aday artifact doğrudan `/commerce-pro/`
adresinden açılabilir. Bu opt-in URL, resmi `/`, kategori, PDP, favoriler, sepet,
auth veya checkout rotalarının Commerce Pro'ya geçirildiği anlamına gelmez.
`server.js` ve legacy route sahipliği bu artifact turunda değişmez.

Rollback sınırı olarak `frontend/index.html`, `categories.html`,
`collections.html`, `product.html`, `login.html`, `forgot-password.html`,
`reset-password.html`, `profile.html`, `checkout.html`, `paytr-checkout.html` ve
`payment-result.html` korunur. Resmi aktivasyon ve rollback routing/entrypoint
seviyesinde, ayrı rezervasyon ve onayla yapılmalıdır.

Bu artifact üretiminde production/uzak DB kullanılmaz ve gerçek ödeme isteği
gönderilmez. Commit, push, PR, merge ve deploy ayrı yetki kapılarıdır.
